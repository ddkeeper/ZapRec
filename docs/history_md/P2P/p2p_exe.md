# 画中画 (PiP) 物理悬浮窗实现方案

## 1. 核心设计原则

* **渲染策略**：采用 `object-fit: cover`，以人物主体为中心填充容器，裁剪多余背景，符合业界标准。
* **交互规范**：本地预览默认水平镜像（Mirroring），鼠标悬浮显示控制栏，离开隐藏。
* **窗口控制**：依赖原生 OS 窗口缩放机制（保留边缘 `no-drag` 触发缩放光标），限制最小尺寸，动态切换长宽比（圆形 1:1，矩形 16:9）。
* **状态同步**：`useAppStore` 作为唯一事实来源（Single Source of Truth），形成 `UI -> Store -> IPC -> Main -> UI` 的闭环。

---

## 2. 状态管理 (`src/store/useAppStore.ts`)

确保在全局状态中增加并暴露画中画状态，独立于录制源（RecordingSource）。

```typescript
// 在 AppState 接口中添加：
interface AppState {
  // ... 其他状态
  pipEnabled: boolean; // 画中画开关状态
  setPipEnabled: (enabled: boolean) => void;
}

// 在 create 内部：
pipEnabled: false,
setPipEnabled: (enabled) => set({ pipEnabled: enabled }),
```

---

## 3. IPC 通信层 (`src/preload/index.ts`)

新增与主进程交互的 API 接口，负责窗口生命周期与形状同步。

```typescript
// 在 window.caplet 接口定义中补充：
export const api = {
  // ... 其他 api
  
  // 画中画相关
  openPipWindow: () => ipcRenderer.send('open-pip'),
  closePipWindow: () => ipcRenderer.send('close-pip'),
  setPipShape: (shape: 'circle' | 'rectangle') => ipcRenderer.send('set-pip-shape', shape),
  
  // 监听来自主进程的小窗关闭事件（用于同步 Store）
  onPipClosed: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('pip-closed', handler)
    return () => ipcRenderer.removeListener('pip-closed', handler)
  }
}
```

---

## 4. 主进程窗口管理 (`src/main/index.ts`)

处理物理窗口的创建、销毁、最小尺寸限制及动态比例切换。

```typescript
import { ipcMain, BrowserWindow, screen } from 'electron'
import path from 'path'

let pipWindow: BrowserWindow | null = null

ipcMain.on('open-pip', () => {
  if (pipWindow) return // 避免重复创建

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  
  // 默认方形 16:9 初始化
  const initialWidth = 320
  const initialHeight = 180

  pipWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: screenWidth - initialWidth - 50, // 初始位置右下角
    y: screenHeight - initialHeight - 50,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true, // 允许原生边角缩放
    minimizable: false,
    maximizable: false,
    hasShadow: true,
    skipTaskbar: true,
    // 限制最小尺寸
    minWidth: 150,
    minHeight: 84, // 150 * (9/16) ≈ 84
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  // 默认 16:9
  pipWindow.setAspectRatio(16 / 9)
  pipWindow.setAlwaysOnTop(true, 'screen-saver')

  // 加载页面
  if (process.env.VITE_DEV_SERVER_URL) {
    pipWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/pip`)
  } else {
    pipWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: 'pip' })
  }

  pipWindow.on('closed', () => {
    pipWindow = null
    // 物理窗口被销毁时（无论是因为主窗口关了还是用户点了小窗的X），通知主窗口同步状态
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pip-closed')
    }
  })
})

ipcMain.on('close-pip', () => {
  if (pipWindow) {
    pipWindow.close() // 会触发上面的 'closed' 事件
  }
})

ipcMain.on('set-pip-shape', (_, shape: 'circle' | 'rectangle') => {
  if (!pipWindow) return
  
  if (shape === 'circle') {
    pipWindow.setAspectRatio(1) // 锁定 1:1
    pipWindow.setMinimumSize(150, 150)
    const bounds = pipWindow.getBounds()
    // 保持中心点不变进行形变
    pipWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: Math.max(150, bounds.height), // 以高度为准变成正方形
      height: Math.max(150, bounds.height)
    })
  } else {
    pipWindow.setAspectRatio(16 / 9) // 锁定 16:9
    pipWindow.setMinimumSize(150, 84)
    const bounds = pipWindow.getBounds()
    pipWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: Math.round(bounds.width * (9 / 16))
    })
  }
})
```

---

## 5. 渲染层：独立 PiP 窗口 (`src/pages/PipWindow.tsx`)

实现视频抓取、cover 裁切、Hover 交互以及 Electron 的无边框拖拽避让机制。

```tsx
import { useEffect, useRef, useState } from 'react'
import { FlipHorizontal, Square, Circle, X } from 'lucide-react'

export default function PipWindow() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isMirrored, setIsMirrored] = useState(true) // 默认镜像
  const [shape, setShape] = useState<'rectangle' | 'circle'>('rectangle')
  const [isHovered, setIsHovered] = useState(false)

  // 初始化摄像头（不带音频）
  useEffect(() => {
    // 这里使用默认视频输入，如果主窗口有保存选定的 deviceId，应通过 IPC 传过来
    navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false // 关键：禁止音频，避免与主窗口的混音冲突
    }).then(stream => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    }).catch(console.error)

    return () => {
      // 卸载时必须关闭摄像头轨道
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const toggleShape = () => {
    const newShape = shape === 'rectangle' ? 'circle' : 'rectangle'
    setShape(newShape)
    window.caplet.setPipShape(newShape) // 通知主进程修改原生窗口比例
  }

  const handleClose = () => {
    window.caplet.closePipWindow()
  }

  return (
    // 外层容器：占满整个窗口，用于捕获 hover，但不设置 drag，让出边缘给原生缩放
    <div 
      className="w-screen h-screen overflow-hidden relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* 实际拖拽区与视觉呈现区：留出一定边缘（inset-1）给操作系统抓取缩放 */}
      <div 
        className={`absolute inset-1 overflow-hidden bg-black/80 transition-all duration-300
          ${shape === 'rectangle' ? 'rounded-lg' : 'rounded-full'}
        `}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full pointer-events-none"
          style={{ 
            objectFit: 'cover', // 关键：填充居中裁切
            transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)' 
          }}
        />
      </div>

      {/* 悬浮控制栏（必须设置为 no-drag 才能响应点击） */}
      <div 
        className={`absolute top-3 right-3 flex gap-1.5 transition-opacity duration-200 z-10
          ${isHovered ? 'opacity-100' : 'opacity-0'}
        `}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button 
          onClick={() => setIsMirrored(!isMirrored)}
          className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-colors"
          title="镜像翻转"
        >
          <FlipHorizontal size={14} />
        </button>
        <button 
          onClick={toggleShape}
          className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-colors"
          title="切换形状"
        >
          {shape === 'rectangle' ? <Circle size={14} /> : <Square size={14} />}
        </button>
        <button 
          onClick={handleClose}
          className="p-1.5 bg-red-500/80 hover:bg-red-600 rounded-full text-white backdrop-blur-md transition-colors"
          title="关闭"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
```

---

## 6. 主窗口控制与状态同步 (`src/App.tsx` 或 `Toolbar.tsx`)

负责打通 UI 按钮点击和物理窗口的实际存活状态。

```tsx
import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

export function usePipSync() {
  const pipEnabled = useAppStore(state => state.pipEnabled)
  const setPipEnabled = useAppStore(state => state.setPipEnabled)

  // 1. 监听 Store 变化，控制主进程开关物理窗口
  useEffect(() => {
    if (pipEnabled) {
      window.caplet.openPipWindow()
    } else {
      window.caplet.closePipWindow()
    }
  }, [pipEnabled])

  // 2. 监听物理窗口被关闭的事件（例如小窗自己点了 X），同步回 Store
  useEffect(() => {
    const unlisten = window.caplet.onPipClosed(() => {
      // 获取最新 state 避免闭包陷阱
      const currentState = useAppStore.getState().pipEnabled
      if (currentState) {
        setPipEnabled(false)
      }
    })
    return () => unlisten()
  }, [setPipEnabled])
}
```