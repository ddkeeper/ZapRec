# 摄像头录制代码文档

## 目录

1. [阶段划分](#1-阶段划分)
2. [窗口创建 `createCameraPreviewWindow`](#2-窗口创建-createCamerPreviewWindow)
3. [阶段一：Toolbar 点击摄像头按钮](#3-阶段一toolbar-点击摄像头按钮)
4. [阶段二：摄像头预览窗口](#4-阶段二摄像头预览窗口)
5. [阶段三：倒计时](#5-阶段三倒计时)
6. [阶段四：录制中预览窗口](#6-阶段四录制中预览窗口)
7. [阶段六：录制结束](#7-阶段六录制结束)
8. [PiP 互斥与恢复](#8-pip-互斥与恢复)
9. [托盘菜单](#9-托盘菜单)
10. [文件清单](#10-文件清单)

---

## 1. 阶段划分

| 阶段 | 触发条件 | 关键行为 |
|------|---------|---------|
| 阶段一 | Toolbar 点击摄像头按钮 | 主窗口隐藏，打开预览窗口，保存 PiP 状态，禁用 PiP 按钮 |
| 阶段二 | 预览窗口 | 全屏窗口内显示居中 640x360 预览框，Enter 确认 / Esc 取消，底部设备选择器 hover 显示 |
| 阶段三 | 确认后倒计时 | 预览窗口隐藏并释放摄像头流，主窗口恢复显示，3 秒倒计时 |
| 阶段四 | 录制开始 | `show-camera-window` 将窗口缩放到右下角小窗（sm/md/lg），渲染层切换到 recording 模式 |
| 阶段五 | 停止录制 | 预览窗口关闭，PiP 状态恢复 |

---

## 2. 窗口创建 `createCameraPreviewWindow`

**`src/main/index.ts` 行 395-443**

```javascript
function createCameraPreviewWindow() {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
  }

  const { x, y, width, height } = screen.getPrimaryDisplay().bounds

  cameraPreviewWindow = new BrowserWindow({
    x, y, width, height,           // 全屏尺寸
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    movable: true,                  // 允许移动
    resizable: false,
    minimizable: false,
    maximizable: false,
    // 注意：无 type 声明（默认 standard），与 PiP 窗口一致
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  cameraPreviewWindow.setResizable(false)
  cameraPreviewWindow.setAspectRatio(16 / 9)   // 锁定长宽比
  cameraPreviewWindow.setAlwaysOnTop(true, 'screen-saver')

  if (VITE_DEV_SERVER_URL) {
    cameraPreviewWindow.loadURL(`${VITE_DEV_SERVER_URL.replace('/index.html', '')}/camera-preview.html`)
  } else {
    cameraPreviewWindow.loadFile(path.join(__dirname, '../../dist/camera-preview.html'))
  }

  cameraPreviewWindow.on('closed', () => {
    const wasConfirming = cameraPreviewConfirming
    cameraPreviewWindow = null
    cameraPreviewConfirming = false
    if (!wasConfirming && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('camera-preview-cancelled')
    }
  })
}
```

### 与 PiP 窗口创建的对比

| 属性 | PiP 窗口 | 摄像头预览窗口 |
|------|---------|--------------|
| 初始尺寸 | 356×200 小窗 | 全屏尺寸 |
| `type` | 无（默认 standard） | 无（与 PiP 一致） |
| `hookWindowMessage` | 无 | 无（已删除） |
| `setAspectRatio` | 有 | 有（16/9） |
| `movable` | 默认 true | 显式 `true` |
| `resizable` | `false` | `false` |

---

## 3. 阶段一：Toolbar 点击摄像头按钮

### `src/components/Toolbar.tsx` 行 106-116

```tsx
if (source === 'camera') {
  const store = useAppStore.getState()
  if (store.pipEnabled) {
    store.setSavedPipEnabled(true)
    store.setPipEnabled(false)
  }
  store.setPipButtonDisabled(true)
  setSelectedSource(source)
  window.caplet.startCameraPreview()
  return
}
```

### `src/preload/index.ts`

```typescript
startCameraPreview: () => ipcRenderer.send('start-camera-preview'),
```

### `src/main/index.ts` 行 579-584

```javascript
ipcMain.on('start-camera-preview', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createCameraPreviewWindow()
})
```

---

## 4. 阶段二：摄像头预览窗口

### 渲染入口

- **`camera-preview.html`**: HTML 入口，`body { margin: 0; background: transparent; }`
- **`src/camera-preview.tsx`**: React 入口，渲染 `CameraPreviewOverlay`，`initialMode='preview'`
- **`src/components/CameraPreviewOverlay.tsx`**: 核心 UI 组件

### 组件状态

```tsx
export default function CameraPreviewOverlay({ onConfirm, onCancel, initialMode = 'preview' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [mode, setMode] = useState<'preview' | 'recording'>(initialMode)
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [isHovered, setIsHovered] = useState(false)
  const savedDeviceIdRef = useRef<string>('')
```

### 流管理

```tsx
const destroyStream = () => {
  if (stream) {
    stream.getTracks().forEach(t => t.stop())
    setStream(null)
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }
}

const initStream = (id: string) => {
  destroyStream()
  navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
  }).then(s => {
    setStream(s)
    if (videoRef.current) {
      videoRef.current.srcObject = s
    }
  }).catch(err => {
    console.error('[CameraPreview] Failed to get camera stream:', err)
  })
}
```

### IPC 事件监听

```tsx
useEffect(() => {
  const unlistenMode = window.caplet.onCameraPreviewModeChanged((newMode) => {
    setMode(newMode)
  })
  const unlistenDestroy = window.caplet.onCameraPreviewDestroyStream(() => {
    destroyStream()
  })
  const unlistenShow = window.caplet.onCameraWindowShow(() => {
    setMode('recording')
    if (savedDeviceIdRef.current) {
      initStream(savedDeviceIdRef.current)
    }
  })
  return () => {
    unlistenMode()
    unlistenDestroy()
    unlistenShow()
  }
}, [])
```

### Preview 模式 JSX（`mode === 'preview'`）

```tsx
if (mode === 'preview') {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 select-none">
      {/* 顶部提示栏 */}
      <div className="absolute top-10 text-white flex gap-6 text-sm">
        <span className="flex items-center gap-2"><Webcam size={16} strokeWidth={2} /> 纯摄像头录制</span>
        <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded text-white">Enter</kbd> 确认</span>
        <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded text-white">Esc</kbd> 取消</span>
      </div>

      {/* 居中预览框：固定 640x360，无控制栏 */}
      <div
        className="relative bg-black rounded-xl overflow-hidden shadow-2xl"
        style={{ width: 640, height: 360, transform: 'translateZ(0)' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className="w-full h-full pointer-events-none"
          style={{ objectFit: 'cover', transform: 'scaleX(-1)' }}
        />

        {/* 底部设备选择器：hover 显示，no-drag 确保可点击 */}
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="px-3 py-1.5 bg-black/70 text-white text-sm rounded-lg backdrop-blur border border-white/20 outline-none cursor-pointer"
          >
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId} className="bg-gray-800">
                {d.label || '未知摄像头'}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
```

### Preview 模式特点

- 全屏透明窗口，640x360 居中黑色预览框
- 顶部提示栏：摄像头图标 + Enter/Esc 操作说明
- 底部设备选择器 hover 显示
- **无拖拽，无控制按钮**
- Enter 确认 → `onConfirm({ deviceId })`
- Esc 取消 → `onCancel()`

---

## 5. 阶段三：倒计时

### 流程

```
确认后
  → cameraPreviewConfirming = true（防止 closed 事件误发 cancelled）
  → mainWindow.show()（主窗口恢复）
  → cameraPreviewWindow.hide()（预览窗口隐藏）
  → camera-preview-destroy-stream（预览窗口释放摄像头流）
  → startCountdown(() => startRecording())
```

### `src/main/index.ts` 行 607-617

```javascript
ipcMain.on('camera-settings-confirmed', (_, settings) => {
  cameraPreviewConfirming = true
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('camera-settings-confirmed', settings)
  }
  if (cameraPreviewWindow) {
    cameraPreviewWindow.hide()
    cameraPreviewWindow.webContents.send('camera-preview-destroy-stream')
  }
})
```

### `src/App.tsx`

```tsx
const unlisten = window.caplet.onCameraSettingsConfirmed((settings) => {
  useAppStore.getState().setPendingCameraSettings(settings)
  useAppStore.getState().setSelectedSource('camera')
  startCountdown(() => startRecording())
})
```

---

## 6. 阶段四：录制中预览窗口

### 完整流程

```
startRecording 完成
  → setStatus('recording')
  → showCameraWindow()
    → show-camera-window IPC
    → setAspectRatio(16/9) + setMinimumSize(150, 84)
    → setBounds 右下角 sm/md/lg 尺寸
    → cameraPreviewWindow.show()
  → cameraPreviewWindow 收到 camera-window-show
    → setMode('recording')
    → initStream(savedDeviceIdRef.current)（独立获取新摄像头流）
```

### `src/App.tsx` 行 318-325

```tsx
await recordingEngine.start()

setLastSavedPath(filepath)
setStatus('recording')

if (currentSource === 'camera') {
  window.caplet.showCameraWindow()
}

if (currentSettings.autoHide) {
  window.caplet.windowMinimize()
}
```

### `src/main/index.ts` IPC

```javascript
// show-camera-window: 缩放到右下角小窗
ipcMain.on('show-camera-window', () => {
  if (cameraPreviewWindow) {
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
    const h = CAMERA_SIZES[currentCameraSizeTier]
    const w = Math.round(h * (16 / 9))
    cameraPreviewWindow.setAspectRatio(16 / 9)
    cameraPreviewWindow.setMinimumSize(150, 84)
    cameraPreviewWindow.setBounds({
      x: screenW - w - 50,         // 右下角
      y: screenH - h - 50,
      width: w,
      height: h
    })
    cameraPreviewWindow.show()
  }
})

// set-camera-size: 调整小窗尺寸
ipcMain.on('set-camera-size', (_, sizeTier) => {
  if (!cameraPreviewWindow) return
  currentCameraSizeTier = sizeTier
  const h = CAMERA_SIZES[sizeTier]
  const w = Math.round(h * (16 / 9))
  const bounds = cameraPreviewWindow.getBounds()
  cameraPreviewWindow.setBounds({
    x: Math.round(bounds.x + (bounds.width - w) / 2),
    y: Math.round(bounds.y + (bounds.height - h) / 2),
    width: w,
    height: h
  })
})

// hide-camera-window: 隐藏窗口
ipcMain.on('hide-camera-window', () => {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.hide()
  }
})
```

### Recording 模式 JSX（`mode === 'recording'`，行 157-209）

```tsx
return (
  // 外层：no-drag 捕获 hover 事件，w-screen h-screen 填满整个窗口视口
  <div
    className="w-screen h-screen overflow-hidden relative flex items-center justify-center"
    onMouseEnter={() => setIsHovered(true)}
    onMouseLeave={() => setIsHovered(false)}
    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
  >
    {/* 内层：drag 区域，用于窗口拖拽，WebkitMaskImage 实现圆角 GPU 裁剪 */}
    <div
      className="w-full h-full overflow-hidden bg-black/80 rounded-lg"
      style={{
        WebkitAppRegion: 'drag',
        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
        transform: 'translateZ(0)'
      } as React.CSSProperties}
    >
      <video
        ref={videoRef}
        autoPlay playsInline muted
        className="w-full h-full pointer-events-none"
        style={{ objectFit: 'cover', transform: 'scaleX(-1)' }}
      />
    </div>

    {/* 控制栏：no-drag 确保完全可点击，hover 显示 */}
    <div
      className={`absolute top-2 right-2 flex gap-1.5 transition-opacity duration-200 z-10 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button onClick={toggleSize} title="切换大小" className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md">
        <Maximize2 size={14} />
      </button>
      <button onClick={() => window.caplet.hideCameraWindow()} title="隐藏窗口" className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md">
        <Minus size={14} />
      </button>
      <button onClick={() => window.caplet.sendRecordingStopped()} title="停止录制" className="p-1.5 bg-red-500/80 hover:bg-red-600 rounded-full text-white backdrop-blur-md">
        <X size={14} />
      </button>
    </div>
  </div>
)
```

### Recording 模式特点（与 Preview 模式对比）

| 特性 | Preview 模式 | Recording 模式 |
|------|-------------|---------------|
| 窗口尺寸 | 全屏窗口，内容 640x360 居中 | 整个窗口 = 小窗尺寸（sm/md/lg） |
| 位置 | 屏幕居中 | 右下角 |
| 外层 drag | 无 | `no-drag`（捕获 hover） |
| 内层 drag | 无 | `drag`（拖拽窗口） |
| 控制按钮 | 无 | 3 个（大小/隐藏/停止），hover 显示 |
| 设备选择器 | hover 显示在底部 | 无 |
| Enter/Esc | 有 | 无 |
| 拖拽移动 | 不支持 | 支持（拖动视频区域） |

### 与 PiP 窗口渲染层结构对比

| 属性 | PiP 窗口 | 摄像头 Recording 模式 |
|------|---------|----------------------|
| 外层容器 | `w-screen h-screen` + `no-drag` | `w-screen h-screen` + `no-drag` |
| 内层 drag 容器 | `w-full h-full` + `drag` + `WebkitMaskImage` | `w-full h-full` + `drag` + `WebkitMaskImage` |
| 控制栏位置 | `top-3 right-3` | `top-2 right-2` |
| hover 触发 | `onMouseEnter/Leave` | `onMouseEnter/Leave` |
| 按钮 | size/shape/close | size/hide/stop |

---

## 7. 阶段六：录制结束

### `src/App.tsx` `stopRecording`

```tsx
const stopRecording = useCallback(async () => {
  try {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const wasCameraMode = useAppStore.getState().selectedSource === 'camera'
    const savedPip = useAppStore.getState().savedPipEnabled

    await recordingEngine.stop()
    await window.caplet.streamEnd()

    stopCropStream()
    audioMixer.destroy()
    mediaCapturer.stopAll()

    displayStreamRef.current = null
    systemAudioStreamRef.current = null
    micStreamRef.current = null

    useAppStore.getState().reset()
    setStatus('idle')

    if (wasCameraMode && savedPip) {
      restorePipState()
    }

    if (wasCameraMode) {
      window.caplet.closeCameraPreviewWindow()
    }

    window.caplet.sendRecordingStopped()

  } catch (error) {
    console.error('[ZapRec] Failed to stop recording:', error)
    // ... 错误处理同上
  }
}, [setStatus, stopCropStream, restorePipState])
```

### `src/main/index.ts`

```javascript
// close-camera-preview-window: 关闭并销毁预览窗口
ipcMain.on('close-camera-preview-window', () => {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
    cameraPreviewWindow = null
  }
})
```

### `restorePipState` 调用时机

- 预览 ESC 取消 → `onCameraPreviewCancelled`
- 倒计时取消 → Toolbar 撤销按钮
- 录制启动失败 → `startRecording` camera 分支错误处理
- 录制正常停止 → `stopRecording`

---

## 8. PiP 互斥与恢复

### 状态保存（进入摄像头模式时）

**`src/components/Toolbar.tsx`**

```tsx
if (source === 'camera') {
  const store = useAppStore.getState()
  if (store.pipEnabled) {
    store.setSavedPipEnabled(true)
    store.setPipEnabled(false)
  }
  store.setPipButtonDisabled(true)
  setSelectedSource(source)
  window.caplet.startCameraPreview()
  return
}
```

### 状态恢复

**`src/App.tsx` `restorePipState`**

```tsx
const restorePipState = useCallback(() => {
  const store = useAppStore.getState()
  if (store.savedPipEnabled) {
    store.setPipEnabled(true)
  }
  store.setSavedPipEnabled(null)
  store.setPipButtonDisabled(false)
}, [])
```

---

## 9. 托盘菜单

**`src/main/index.ts` 行 126-135**

```javascript
const contextMenu = Menu.buildFromTemplate([
  { label: '显示主窗口', click: () => mainWindow?.show() },
  { label: '显示摄像头小窗', click: () => {
    if (cameraPreviewWindow && !cameraPreviewWindow.isVisible()) {
      cameraPreviewWindow.show()
    }
  }},
  { type: 'separator' },
  { label: '退出', click: () => app.quit() }
])
```

---

## 10. 文件清单

| 文件 | 职责 |
|------|------|
| `src/components/CameraPreviewOverlay.tsx` | 预览/录制窗口 UI 组件（两种模式） |
| `src/camera-preview.tsx` | 预览窗口 React 入口 |
| `camera-preview.html` | 预览窗口 HTML 入口 |
| `camera-preview.css` / `src/index.css` | 全局样式（`body { margin: 0; background: transparent }`） |
| `src/components/Toolbar.tsx` 行 106-116 | 摄像头按钮点击处理 |
| `src/App.tsx` | `restorePipState()`、录制流程、IPC 监听 |
| `src/store/useAppStore.ts` | `pendingCameraSettings`, `pipButtonDisabled`, `savedPipEnabled` |
| `src/main/index.ts` 行 395-443 | `createCameraPreviewWindow()` |
| `src/main/index.ts` 行 579-584 | `start-camera-preview` IPC |
| `src/main/index.ts` 行 607-617 | `camera-settings-confirmed` IPC |
| `src/main/index.ts` 行 621-625 | `hide-camera-window` IPC |
| `src/main/index.ts` 行 627-641 | `show-camera-window` IPC（缩放到右下角小窗） |
| `src/main/index.ts` 行 601-619 | `set-camera-size` IPC |
| `src/main/index.ts` 行 651-655 | `close-camera-preview-window` IPC |
| `src/main/index.ts` 行 126-135 | 托盘菜单（含"显示摄像头小窗"） |
| `src/preload/index.ts` 行 67-106 | Renderer IPC 方法定义 |

### IPC 通道汇总

| 方向 | 通道名 | 触发方 | 处理方 | 用途 |
|------|--------|--------|--------|------|
| Renderer → Main | `start-camera-preview` | Toolbar | main | 打开预览窗口 |
| Renderer → Main | `camera-settings-confirmed` | camera-preview.tsx | main | 确认设备，隐藏预览窗口 |
| Renderer → Main | `cancel-camera-preview` | camera-preview.tsx | main | 取消预览 |
| Renderer → Main | `show-camera-window` | App.tsx | main | 显示录制中小窗 |
| Renderer → Main | `hide-camera-window` | CameraPreviewOverlay | main | 隐藏小窗 |
| Renderer → Main | `set-camera-size` | CameraPreviewOverlay | main | 调整小窗尺寸 |
| Renderer → Main | `close-camera-preview-window` | App.tsx | main | 关闭预览窗口 |
| Main → Renderer | `camera-preview-mode-changed` | main | CameraPreviewOverlay | 切换 preview/recording 模式 |
| Main → Renderer | `camera-preview-destroy-stream` | main | CameraPreviewOverlay | 销毁摄像头流 |
| Main → Renderer | `camera-window-show` | main | CameraPreviewOverlay | 切换到 recording 模式 |
| Main → App | `camera-settings-confirmed` | main | App.tsx | 开始倒计时 |
| Main → App | `camera-preview-cancelled` | main | App.tsx | 取消回调 |
