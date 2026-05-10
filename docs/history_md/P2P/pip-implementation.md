# 画中画 (PiP) 功能代码文档

## 目录

1. [整体架构](#1-整体架构)
2. [状态管理](#2-状态管理)
3. [UI 触发层](#3-ui-触发层)
4. [IPC 通信层](#4-ipc-通信层)
5. [主进程窗口管理](#5-主进程窗口管理)
6. [独立窗口渲染层](#6-独立窗口渲染层)
7. [状态同步 Hook](#7-状态同步-hook)
8. [构建配置](#8-构建配置)
9. [生命周期时序图](#9-生命周期时序图)

---

## 1. 整体架构

PiP 采用**物理独立悬浮窗口**方案，通过 Electron 的 `alwaysOnTop` 原生窗口实现。

- **全屏录制模式下**：系统录屏会天然捕获置顶的 PiP 物理窗口，无需额外的 Canvas 混流
- **区域/窗口录制模式下**：需要下一阶段的 Canvas 混流方案
- **Single Source of Truth**：`useAppStore` 的 `pipEnabled` 是唯一状态来源

```
Toolbar (UI层)
    ↓ 点击 setPipEnabled(true)
useAppStore (pipEnabled: true)
    ↓ usePipSync 监听
preload (ipcRenderer.send)
    ↓
主进程 (BrowserWindow)
    ↓ createPipWindow()
PiP 窗口 (独立渲染进程)
    ↓ getUserMedia
摄像头 (硬件)
```

---

## 2. 状态管理

### `src/shared/types.ts`

```typescript
// 行 35: pipEnabled 状态定义
export interface AppState {
  pipEnabled: boolean    // 画中画开关状态
  // ...
}
```

### `src/store/useAppStore.ts`

```typescript
// 行 45: 初始值
pipEnabled: false,

// 行 62: setter
setPipEnabled: (enabled: boolean) => set({ pipEnabled: enabled }),
```

---

## 3. UI 触发层

### `src/components/Toolbar.tsx`

```tsx
// 行 280-289: 画中画按钮
<button
  onClick={() => setPipEnabled(!pipEnabled)}
  title={pipEnabled ? "画中画：关闭" : "画中画：开启"}
>
  <SquareUser size={18} strokeWidth={2} color={pipEnabled ? 'white' : 'rgba(255,255,255,0.4)'} />
  <span className={pipEnabled ? 'text-white' : 'text-white/40'}>
    画中画
  </span>
</button>
```

### `src/App.tsx`

```tsx
// 行 29: 集成状态同步
const { startCountdown } = useRecordingCountdown()
usePipSync()  // ← 监听 pipEnabled → openPipWindow / closePipWindow
```

---

## 4. IPC 通信层

### `src/preload/index.ts`

```typescript
// 行 84-92: PiP 相关 IPC 方法
openPipWindow: () => ipcRenderer.send('open-pip'),
closePipWindow: () => ipcRenderer.send('close-pip'),
setPipShape: (shape: 'circle' | 'rectangle') => ipcRenderer.send('set-pip-shape', shape),

onPipClosed: (callback: () => void) => {
  const handler = () => callback()
  ipcRenderer.on('pip-closed', handler)
  return () => ipcRenderer.removeListener('pip-closed', handler)
}
```

### `src/core/MediaCapturer.ts` (类型声明)

```typescript
// 行 35-38: window.caplet 类型补充
declare global {
  interface Window {
    caplet: {
      openPipWindow: () => void
      closePipWindow: () => void
      setPipShape: (shape: 'circle' | 'rectangle') => void
      onPipClosed: (callback: () => void) => () => void
    }
  }
}
```

---

## 5. 主进程窗口管理

### `src/main/index.ts`

#### 5.1 变量声明

```typescript
// 行 30: pipWindow 变量
let pipWindow: BrowserWindow | null = null
```

#### 5.2 createPipWindow 函数

```typescript
// 行 442-500: 创建 PiP 窗口
function createPipWindow() {
  if (pipWindow) return  // 避免重复创建

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const initialWidth = 320
  const initialHeight = 180

  pipWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: screenWidth - initialWidth - 50,  // 右下角
    y: screenHeight - initialHeight - 50,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,      // 允许原生边角缩放
    minimizable: false,
    maximizable: false,
    hasShadow: true,
    skipTaskbar: true,
    minWidth: 150,
    minHeight: 84,        // 150 * (9/16)
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  pipWindow.setAspectRatio(16 / 9)
  pipWindow.setAlwaysOnTop(true, 'screen-saver')

  // 开发环境 / 生产环境 加载路径
  if (VITE_DEV_SERVER_URL) {
    pipWindow.loadURL(`${VITE_DEV_SERVER_URL.replace('/index.html', '')}/pip-window.html`)
  } else {
    pipWindow.loadFile(path.join(__dirname, '../../dist/pip-window.html'))
  }

  // 开发环境：转发渲染进程 console 到主进程
  if (VITE_DEV_SERVER_URL) {
    pipWindow.webContents.on('console-message', (_, level, message) => { ... })
    pipWindow.webContents.on('render-process-gone', (_, details) => { ... })
  }

  // 窗口关闭时：清空引用，并通知主窗口同步状态
  pipWindow.on('closed', () => {
    pipWindow = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pip-closed')
    }
  })
}
```

#### 5.3 destroyPipWindow 函数

```typescript
// 行 503-508: 销毁 PiP 窗口
function destroyPipWindow() {
  if (pipWindow) {
    pipWindow.close()
    pipWindow = null
  }
}
```

#### 5.4 IPC Handlers

```typescript
// 行 571-603: PiP IPC 处理

// 打开窗口
ipcMain.on('open-pip', () => {
  createPipWindow()
})

// 关闭窗口
ipcMain.on('close-pip', () => {
  destroyPipWindow()
})

// 切换形状
ipcMain.on('set-pip-shape', (_, shape: 'circle' | 'rectangle') => {
  if (!pipWindow) return

  if (shape === 'circle') {
    pipWindow.setAspectRatio(1)              // 锁定 1:1
    pipWindow.setMinimumSize(150, 150)
    const bounds = pipWindow.getBounds()
    pipWindow.setBounds({
      width: Math.max(150, bounds.height),
      height: Math.max(150, bounds.height)
    })
  } else {
    pipWindow.setAspectRatio(16 / 9)         // 锁定 16:9
    pipWindow.setMinimumSize(150, 84)
    const bounds = pipWindow.getBounds()
    pipWindow.setBounds({
      height: Math.round(bounds.width * (9 / 16))
    })
  }
})
```

#### 5.5 级联清理

```typescript
// 行 90-95: 主窗口关闭时同步销毁 PiP 窗口
mainWindow.on('close', () => {
  destroySelectionWindow()
  destroyWindowPickerWindow()
  destroyPipWindow()  // ← 新增
})
```

---

## 6. 独立窗口渲染层

### 6.1 HTML 入口

#### `pip-window.html`

```html
<!-- 行 1-15: 透明背景，无边框 -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:;" />
<body style="margin: 0; background: transparent;">
  <div id="root"></div>
  <script type="module" src="/src/pip-window.tsx"></script>
</body>
```

### 6.2 React 入口

#### `src/pip-window.tsx`

```tsx
// 行 1-16: 渲染 PipWindow 组件
import ReactDOM from 'react-dom/client'
import PipWindow from './components/PipWindow'
import './index.css'

console.log('[pip-window] Entry loaded')
try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <PipWindow />
    </React.StrictMode>
  )
} catch (err) {
  console.error('[pip-window] Render error:', err)
}
```

### 6.3 核心组件

#### `src/components/PipWindow.tsx`

```tsx
// 行 4-8: 组件状态
export default function PipWindow() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isMirrored, setIsMirrored] = useState(true)      // 默认镜像
  const [shape, setShape] = useState<'rectangle' | 'circle'>('rectangle')
  const [isHovered, setIsHovered] = useState(false)
```

```tsx
// 行 10-34: 摄像头初始化
useEffect(() => {
  console.log('[PipWindow] useEffect triggered, requesting camera...')
  let stream: MediaStream | null = null

  navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false  // 关键：禁止音频，避免与主窗口混音冲突
  }).then(s => {
    console.log('[PipWindow] Camera stream obtained:', s.id)
    stream = s
    if (videoRef.current) {
      videoRef.current.srcObject = s
      videoRef.current.play().catch(console.error)
    }
  }).catch(err => {
    console.error('[PipWindow] getUserMedia failed:', err.name, err.message)
  })

  return () => {
    console.log('[PipWindow] Cleanup, stopping tracks...')
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
    }
  }
}, [])
```

```tsx
// 行 36-44: 形状切换 & 关闭
const toggleShape = () => {
  const newShape = shape === 'rectangle' ? 'circle' : 'rectangle'
  setShape(newShape)
  window.caplet.setPipShape(newShape)  // 通知主进程修改原生窗口比例
}

const handleClose = () => {
  window.caplet.closePipWindow()
}
```

```tsx
// 行 46-70: 小窗结构（双层 no-drag / drag 分区）
<div
  className="w-screen h-screen overflow-hidden relative"
  onMouseEnter={() => setIsHovered(true)}
  onMouseLeave={() => setIsHovered(false)}
  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
>
  {/* 拖拽区：占据整个窗口（inset-0），保留边框可见 */}
  <div
    className={`absolute inset-0 overflow-hidden bg-black/80 border-2 border-white/30
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
        objectFit: 'cover',                           // 关键：居中裁切填充
        transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)'
      }}
    />
  </div>

  {/* 控制栏：悬浮显示，设置为 no-drag 以响应点击 */}
  <div
    className={`absolute top-3 right-3 flex gap-1.5 transition-opacity duration-200 z-10
      ${isHovered ? 'opacity-100' : 'opacity-0'}
    `}
    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
  >
    <button onClick={() => setIsMirrored(!isMirrored)} title="镜像翻转">
      <FlipHorizontal size={14} />
    </button>
    <button onClick={toggleShape} title="切换形状">
      {shape === 'rectangle' ? <Circle size={14} /> : <Square size={14} />}
    </button>
    <button onClick={handleClose} title="关闭" className="bg-red-500/80">
      <X size={14} />
    </button>
  </div>
</div>
```

---

## 7. 状态同步 Hook

### `src/hooks/usePipSync.ts`

```typescript
// 行 4-24: Store ↔ 主进程的闭环同步
export function usePipSync() {
  const pipEnabled = useAppStore(state => state.pipEnabled)
  const setPipEnabled = useAppStore(state => state.setPipEnabled)

  // 监听 Store 变化，控制主进程开关物理窗口
  useEffect(() => {
    if (pipEnabled) {
      window.caplet.openPipWindow()
    } else {
      window.caplet.closePipWindow()
    }
  }, [pipEnabled])

  // 监听物理窗口被关闭的事件（如小窗自己点了 X），同步回 Store
  useEffect(() => {
    const unlisten = window.caplet.onPipClosed(() => {
      const currentState = useAppStore.getState().pipEnabled
      if (currentState) {
        setPipEnabled(false)
      }
    })
    return () => unlisten()
  }, [setPipEnabled])
}
```

---

## 8. 构建配置

### `vite.config.ts`

```typescript
// 行 59-67: 多页面入口
build: {
  rollupOptions: {
    input: {
      main: path.resolve(__dirname, 'index.html'),
      'window-picker': path.resolve(__dirname, 'window-picker.html'),
      'camera-preview': path.resolve(__dirname, 'camera-preview.html'),
      'pip-window': path.resolve(__dirname, 'pip-window.html')  // ← 新增
    }
  }
}
```

---

## 9. 生命周期时序图

### 打开 PiP

```
用户点击 Toolbar 按钮
    ↓
setPipEnabled(true)
    ↓
usePipSync 监听 (pipEnabled === true)
    ↓
window.caplet.openPipWindow()
    ↓
ipcRenderer.send('open-pip')
    ↓
主进程: ipcMain.on('open-pip')
    ↓
createPipWindow()
    ↓
new BrowserWindow({ alwaysOnTop: true, ... })
    ↓
pipWindow.loadURL('pip-window.html')
    ↓
PipWindow.tsx mount → useEffect
    ↓
navigator.mediaDevices.getUserMedia()
    ↓
video.srcObject = stream
    ↓
摄像头画面显示在小窗中
```

### 关闭 PiP（从 Toolbar 关闭）

```
用户再次点击 Toolbar 按钮
    ↓
setPipEnabled(false)
    ↓
usePipSync 监听 (pipEnabled === false)
    ↓
window.caplet.closePipWindow()
    ↓
ipcRenderer.send('close-pip')
    ↓
主进程: ipcMain.on('close-pip')
    ↓
destroyPipWindow() → pipWindow.close()
    ↓
pipWindow 'closed' 事件触发
    ↓
mainWindow.webContents.send('pip-closed')
    ↓
usePipSync onPipClosed 监听 → setPipEnabled(false)
```

### 关闭 PiP（从小窗 X 按钮关闭）

```
用户点击小窗 X 按钮
    ↓
handleClose() → window.caplet.closePipWindow()
    ↓
(同上方流程...)
    ↓
pipWindow 'closed' 事件
    ↓
pip-closed 消息发送 → setPipEnabled(false)
    ↓
Toolbar UI 状态同步（按钮变暗）
```

---

## 文件清单

| 文件 | 职责 |
|------|------|
| `src/shared/types.ts` | `pipEnabled` 状态类型定义 |
| `src/store/useAppStore.ts` | `pipEnabled` 状态存储 |
| `src/components/Toolbar.tsx` | UI 按钮，调用 `setPipEnabled` |
| `src/App.tsx` | 集成 `usePipSync` |
| `src/preload/index.ts` | IPC 桥接：`openPip/closePip/setPipShape/onPipClosed` |
| `src/core/MediaCapturer.ts` | `window.caplet` 类型声明 |
| `src/main/index.ts` | `createPipWindow`/`destroyPipWindow` + IPC handlers |
| `pip-window.html` | PiP 窗口 HTML 入口 |
| `src/pip-window.tsx` | PiP 窗口 React 入口 |
| `src/components/PipWindow.tsx` | 摄像头预览 + 拖拽 + 控制栏 |
| `src/hooks/usePipSync.ts` | Store ↔ 主进程状态同步 |
| `vite.config.ts` | `pip-window.html` 多页面入口配置 |
