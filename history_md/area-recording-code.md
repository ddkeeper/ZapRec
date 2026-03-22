# ZapRec 区域录制功能 - 完整代码整理

## 一、代码分布总览

| 文件 | 职责 | 相关行号 |
|------|------|----------|
| `src/App.tsx` | 录制启动逻辑、选区裁剪 | 11, 32-121, 218-241, 427-435 |
| `src/components/AreaOverlay.tsx` | 选区选择 UI 组件 | 全文 |
| `src/components/Toolbar.tsx` | 触发选区选择 | 23, 30, 69-91, 103-106 |
| `src/core/MediaCapturer.ts` | 屏幕捕获 | 全文 |
| `src/store/useAppStore.ts` | 状态管理 | 16, 49 |
| `src/main/index.ts` | 选区窗口管理 | 27, 225-299, 406-433 |
| `src/preload/index.ts` | IPC 通信 | 16-28 |

---

## 二、核心代码

### 2.1 App.tsx - 独立选区窗口入口

**文件**: `src/App.tsx` (第 11-16, 427-435 行)

```typescript
// 第 11 行 - 检测是否为选区选择模式
const isAreaSelectionMode = window.location.hash === '#/area-selection'

// 第 427-435 行 - 选区窗口渲染组件
function AreaOverlayForSelectionWindow() {
  const handleConfirm = (area: AreaSelection) => {
    window.caplet.sendAreaSelected(area)
  }
  const handleCancel = () => {
    window.caplet.cancelAreaSelection()
  }
  return <AreaOverlay onConfirm={handleConfirm} onCancel={handleCancel} />
}
```

---

### 2.2 App.tsx - 画布裁剪逻辑

**文件**: `src/App.tsx` (第 32-121 行)

```typescript
const createCroppedStream = useCallback(async (
  mainStream: MediaStream, 
  area: AreaSelection | null
): Promise<MediaStream> => {
  if (!area) return mainStream

  const mainVideoTrack = mainStream.getVideoTracks()[0]
  if (!mainVideoTrack) {
    console.error('[ZapRec] No video track found in main stream')
    return mainStream
  }

  // 创建 video 元素获取实际分辨率
  const mainVideo = document.createElement('video')
  mainVideo.srcObject = new MediaStream([mainVideoTrack])
  mainVideo.muted = true
  mainVideo.autoplay = true
  mainVideo.playsInline = true
  videoElementRef.current = mainVideo

  // 等待元数据加载
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Main video load timeout')), 5000)
    mainVideo.onloadedmetadata = () => {
      clearTimeout(timeout)
      resolve()
    }
    mainVideo.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('Main video error'))
    }
  })

  const vw = mainVideo.videoWidth
  const vh = mainVideo.videoHeight

  // 计算物理坐标
  const screenWidth = window.screen.width
  const currentScale = (vw > 0 && screenWidth > 0) ? (vw / screenWidth) : (window.devicePixelRatio || 1)

  let physicalX = Math.round(area.x * currentScale)
  let physicalY = Math.round(area.y * currentScale)
  let physicalW = Math.round(area.width * currentScale)
  let physicalH = Math.round(area.height * currentScale)

  // 边界检查
  physicalX = Math.max(0, Math.min(physicalX, vw))
  physicalY = Math.max(0, Math.min(physicalY, vh))
  physicalW = Math.min(physicalW, vw - physicalX)
  physicalH = Math.min(physicalH, vh - physicalY)

  // 偶数对齐
  physicalW = physicalW % 2 === 0 ? physicalW : physicalW - 1
  physicalH = physicalH % 2 === 0 ? physicalH : physicalH - 1

  console.log(`[ZapRec] Main video resolution: ${vw}x${vh}`)
  console.log(`[ZapRec] Output canvas resolution: ${physicalW}x${physicalH}`)

  // 创建画布
  const canvas = document.createElement('canvas')
  canvas.width = physicalW
  canvas.height = physicalH
  canvasRef.current = canvas

  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  mainVideo.play().catch(err => console.error('[ZapRec] Main video play error:', err))

  if (mainVideo.readyState >= 2) {
    ctx.drawImage(mainVideo, physicalX, physicalY, physicalW, physicalH, 0, 0, physicalW, physicalH)
  }

  // 定时更新帧
  cropIntervalRef.current = setInterval(() => {
    const v = videoElementRef.current
    if (!v || v.readyState < 2) return
    ctx.drawImage(v, physicalX, physicalY, physicalW, physicalH, 0, 0, physicalW, physicalH)
  }, 1000 / 30)

  return canvas.captureStream(30)
}, [])
```

---

### 2.3 App.tsx - 区域录制启动逻辑

**文件**: `src/App.tsx` (第 218-241 行)

```typescript
} else if (currentSource === 'area') {
  const pendingArea = state.pendingAreaSelection
  if (!pendingArea) {
    console.error('[ZapRec] Area mode but no pending area selection')
    await window.caplet.streamEnd()
    setStatus('idle')
    return
  }

  // 先捕获全屏流
  const rawStream = await mediaCapturer.startDisplayCapture('screen:0:0')
  displayStreamRef.current = rawStream

  // 仅进行纯物理画布裁剪
  displayStream = await createCroppedStream(rawStream, pendingArea)
  
  // 从 canvasRef 读出实际的物理尺寸
  if (canvasRef.current) {
    recordingWidth = canvasRef.current.width
    recordingHeight = canvasRef.current.height
  }

  // 清除已消费的选区
  useAppStore.getState().setPendingAreaSelection(null)
}
```

---

### 2.4 AreaOverlay.tsx - 选区选择组件

**文件**: `src/components/AreaOverlay.tsx` (全文)

```typescript
export interface AreaSelection {
  x: number
  y: number
  width: number
  height: number
}

export default function AreaOverlay({ onConfirm, onCancel }: AreaOverlayProps) {
  const [isSelecting, setIsSelecting] = useState(false)
  const [selection, setSelection] = useState<AreaSelection | null>(null)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [isRecordingVisuals, setIsRecordingVisuals] = useState(false)

  // 监听录制视觉切换
  useEffect(() => {
    const unlisten = window.caplet.onSwitchToRecordingVisuals(() => {
      setIsRecordingVisuals(true)
    })
    return () => unlisten()
  }, [])

  // 鼠标事件处理
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isRecordingVisuals) return
    setIsSelecting(true)
    setStartPoint({ x: e.clientX, y: e.clientY })
    setSelection(null)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting || !startPoint) return
    const x = Math.min(startPoint.x, e.clientX)
    const y = Math.min(startPoint.y, e.clientY)
    const width = Math.abs(e.clientX - startPoint.x)
    const height = Math.abs(e.clientY - startPoint.y)
    setSelection({ x, y, width, height })
  }

  const handleMouseUp = () => {
    setIsSelecting(false)
  }

  // 键盘事件
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && selection && selection.width > 10 && selection.height > 10) {
      onConfirm(selection)
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  // UI: 录制视觉 - 幽灵镂空幕布
  {isRecordingVisuals && selection && (
    <svg>
      <mask id="recording-hole">
        <rect width="100%" height="100%" fill="white" />
        <rect x={selection.x} y={selection.y} width={selection.width} height={selection.height} fill="black" />
      </mask>
      <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.6)" mask="url(#recording-hole)" />
    </svg>
  )}

  // UI: 选区选择 - 蓝色选框
  {!isRecordingVisuals && selection && (
    <div className="absolute border-2 border-blue-500">
      {/* 四角手柄 */}
      <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500" />
      <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500" />
      <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-500" />
      <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500" />
      {/* 尺寸指示器 */}
      <div className="absolute px-2 py-1 text-xs text-white bg-black/70"
           style={{ right: 0, bottom: '-32px' }}>
        {Math.round(selection.width)} × {Math.round(selection.height)}
      </div>
    </div>
  )}

  // UI: 操作提示
  {!isRecordingVisuals && (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white px-6 py-3 rounded-full text-sm">
      <span>🖱️ 拖拽以选择录制区域</span>
      <span>↵ Enter 确认</span>
      <span>Esc 取消</span>
    </div>
  )}
}
```

---

### 2.5 Toolbar.tsx - 触发选区选择

**文件**: `src/components/Toolbar.tsx` (第 69-106 行)

```typescript
// 第 69-91 行 - 监听选区选择完成
useEffect(() => {
  const unlisten = window.caplet.onAreaSelected((area) => {
    setPendingAreaSelection(area)
    setSelectedSource('area')

    const countdownSeconds = settings.countdown || 3
    let count = countdownSeconds
    
    setStatus('countdown')
    const countdownTimer = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(countdownTimer)
        setStatus('idle')
        onStartRecording()
      } else {
        setStatus('countdown')
      }
    }, 1000)
  })
  
  return () => unlisten()
}, [settings.countdown, setSelectedSource, setPendingAreaSelection, setStatus, onStartRecording])

// 第 103-106 行 - 点击区域按钮触发选择
const handleSourceClick = useCallback((source: RecordingSource) => {
  if (source === 'area') {
    setSelectedSource(source)
    window.caplet.startAreaSelection()
    return
  }
  // ...
}, [])
```

---

### 2.6 主进程 - 选区窗口管理

**文件**: `src/main/index.ts` (第 225-299, 406-433 行)

```typescript
// 第 225-293 行 - 创建选区窗口
function createSelectionWindow() {
  if (selectionWindow) {
    selectionWindow.close()
  }

  const rawUrl = mainWindow?.webContents.getURL() || ''
  const baseUrl = rawUrl.split('#')[0]
  const selectionUrl = `${baseUrl}#/area-selection`

  const { x, y, width, height } = screen.getPrimaryDisplay().bounds

  selectionWindow = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    movable: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    type: 'toolbar',
    minWidth: width, maxWidth: width,
    minHeight: height, maxHeight: height,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  selectionWindow.setAlwaysOnTop(true, 'screen-saver')
  selectionWindow.loadURL(selectionUrl)

  // Windows 禁用缩放光标
  if (process.platform === 'win32') {
    selectionWindow.hookWindowMessage(0x0084, (_e, result) => {
      result.writeInt32LE(1, 0)
      return true
    })
  }

  selectionWindow.on('closed', () => {
    selectionWindow = null
  })
}

// 第 406-433 行 - IPC 事件处理
ipcMain.on('start-area-selection', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createSelectionWindow()
})

ipcMain.on('area-selected', (_, area) => {
  // 不销毁遮罩，保留为阴影幕布
  if (selectionWindow) {
    selectionWindow.setIgnoreMouseEvents(true, { forward: true })
    selectionWindow.webContents.send('switch-to-recording-visuals')
  }
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('area-selected', area)
  }
})

ipcMain.on('cancel-area-selection', () => {
  destroySelectionWindow()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('area-selection-cancelled')
  }
})
```

---

### 2.7 preload - IPC 通信

**文件**: `src/preload/index.ts`

```typescript
startAreaSelection: () => ipcRenderer.send('start-area-selection'),
cancelAreaSelection: () => ipcRenderer.send('cancel-area-selection'),
sendAreaSelected: (area) => ipcRenderer.send('area-selected', area),

onAreaSelected: (callback) => {
  const handler = (_, area) => callback(area)
  ipcRenderer.on('area-selected', handler)
  return () => ipcRenderer.removeListener('area-selected', handler)
},
onAreaSelectionCancelled: (callback) => {
  const handler = () => callback()
  ipcRenderer.on('area-selection-cancelled', handler)
  return () => ipcRenderer.removeListener('area-selection-cancelled', handler)
},
onSwitchToRecordingVisuals: (callback) => {
  const handler = () => callback()
  ipcRenderer.on('switch-to-recording-visuals', handler)
  return () => ipcRenderer.removeListener('switch-to-recording-visuals', handler)
}
```

---

### 2.8 store - 状态管理

**文件**: `src/store/useAppStore.ts`

```typescript
pendingAreaSelection: { x: number; y: number; width: number; height: number } | null
setPendingAreaSelection: (area) => set({ pendingAreaSelection: area }),
```

---

## 三、工作流程图

```
用户点击"区域"按钮
        ↓
Toolbar.handleSourceClick('area')
        ↓
window.caplet.startAreaSelection()
        ↓
[主进程] mainWindow.hide() + createSelectionWindow()
        ↓
selectionWindow.loadURL('...#/area-selection')
        ↓
AreaOverlay 组件渲染（选区选择模式）
        ↓
用户拖拽选择区域 → Enter 确认
        ↓
window.caplet.sendAreaSelected(area)
        ↓
[主进程] area-selected → mainWindow.webContents.send('area-selected')
        ↓
Toolbar.onAreaSelected(area) → setPendingAreaSelection + countdown
        ↓
startRecording()
        ↓
App.tsx: currentSource === 'area'
        ↓
mediaCapturer.startDisplayCapture('screen:0:0')
        ↓
createCroppedStream(rawStream, pendingArea)
        ↓
canvas.captureStream(30) → 录制
```

---

## 四、预期表现验证清单

| 预期 | 当前状态 |
|------|----------|
| 点击"区域"按钮后弹出全屏选区覆盖层 | ✅ |
| 拖拽选择区域时有蓝色选框 | ✅ |
| 显示实时尺寸指示器 | ✅ |
| Enter 确认后开始倒计时 | ✅ |
| Esc 取消选区 | ✅ |
| 录制时显示幽灵镂空幕布 | ✅ |
| 选区尺寸正确映射到视频 | ✅ |
| 偶数分辨率对齐 | ✅ |
