# 区域录制代码完整文档

## 1. 核心组件：AreaOverlay.tsx

```tsx
// src/components/AreaOverlay.tsx
import { useState, useRef, useCallback, useEffect } from 'react'
import { SquareMousePointer } from 'lucide-react'

export interface AreaSelection {
  x: number
  y: number
  height: number
  width: number
}

interface AreaOverlayProps {
  onConfirm: (area: AreaSelection) => void
  onCancel: () => void
}

export default function AreaOverlay({ onConfirm, onCancel }: AreaOverlayProps) {
  const [isSelecting, setIsSelecting] = useState(false)
  const [selection, setSelection] = useState<AreaSelection | null>(null)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [isRecordingVisuals, setIsRecordingVisuals] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // 监听从主进程发来的切换到录制视觉模式的消息
  useEffect(() => {
    const unlisten = window.caplet.onSwitchToRecordingVisuals(() => {
      setIsRecordingVisuals(true)
    })
    return () => unlisten()
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isRecordingVisuals) return
    setIsSelecting(true)
    setStartPoint({ x: e.clientX, y: e.clientY })
    setSelection(null)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !startPoint) return
    const x = Math.min(startPoint.x, e.clientX)
    const y = Math.min(startPoint.y, e.clientY)
    const width = Math.abs(e.clientX - startPoint.x)
    const height = Math.abs(e.clientY - startPoint.y)
    setSelection({ x, y, width, height })
  }, [isSelecting, startPoint])

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && selection && selection.width > 10 && selection.height > 10) {
      onConfirm(selection)
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }, [selection, onConfirm, onCancel])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-[9999] select-none ${isRecordingVisuals ? 'pointer-events-none' : ''}`}
      style={{
        WebkitAppRegion: 'no-drag',
        WebkitUserSelect: 'none',
      } as React.CSSProperties}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 选择阶段遮罩层（会镂空） */}
      {!isRecordingVisuals && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="selection-mask">
              <rect width="100%" height="100%" fill="white" />
              {selection && (
                <rect
                  x={selection.x}
                  y={selection.y}
                  width={selection.width}
                  height={selection.height}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#selection-mask)" />
        </svg>
      )}

      {/* 顶部提示栏 */}
      {!isRecordingVisuals && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm text-white flex gap-6"
            style={{
              backgroundColor: 'rgba(17, 24, 40, 0.95)',
              border: '2px solid rgba(255, 255, 255, 0.35)',
              backdropFilter: 'blur(10px)',
              zIndex: 10001,
            }}>
          <span className="flex items-center gap-2"><SquareMousePointer size={16} /> 拖拽选择录制区域</span>
          <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded">Enter</kbd> 确认</span>
          <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded">Esc</kbd> 取消</span>
        </div>
      )}

      {/* 录制中遮罩 - 指示不录制区域 */}
      {isRecordingVisuals && selection && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="recording-hole">
              <rect width="100%" height="100%" fill="white" />
              <rect x={selection.x} y={selection.y} width={selection.width} height={selection.height} fill="black" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#recording-hole)" />
        </svg>
      )}

      {/* 选框 */}
      {!isRecordingVisuals && selection && (
        <div className="absolute border-2 border-blue-500 bg-transparent"
             style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}>
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-sm" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-sm" />
          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-500 rounded-sm" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 rounded-sm" />
          <div className="absolute right-2 bottom-2 px-2 py-1 text-xs font-mono text-white rounded-md"
               style={{ backgroundColor: 'rgba(40,40,40,0.85)', backdropFilter: 'blur(4px)' }}>
            {Math.round(selection.width * window.devicePixelRatio)} × {Math.round(selection.height * window.devicePixelRatio)}
          </div>
        </div>
      )}
    </div>
  )
}
```

## 2. 页面入口：area-selection 模式

```tsx
// src/App.tsx 中
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

## 3. Store 状态管理

```typescript
// src/store/useAppStore.ts

export interface ActiveCropArea {
  x: number
  y: number
  width: number
  height: number
  scaleX: number
  scaleY: number
}

interface AppStore extends AppState {
  pendingAreaSelection: { x: number; y: number; width: number; height: number } | null
  activeCropArea: ActiveCropArea | null
  setPendingAreaSelection: (area: { x: number; y: number; width: number; height: number } | null) => void
  setActiveCropArea: (area: ActiveCropArea | null) => void
}

// 初始化状态
pendingAreaSelection: null,
activeCropArea: null,

// 方法实现
setPendingAreaSelection: (area) => set({ pendingAreaSelection: area }),
setActiveCropArea: (area) => set({ activeCropArea: area }),

// reset 中重置
pendingAreaSelection: null,
activeCropArea: null,
```

## 4. 主进程 IPC 处理

```typescript
// src/main/index.ts

// 全局变量
let selectionWindow: BrowserWindow | null = null

// 创建选择窗口
function createSelectionWindow() {
  if (selectionWindow) {
    selectionWindow.close()
  }

  const rawUrl = mainWindow?.webContents.getURL() || ''
  const baseUrl = rawUrl.split('#')[0]
  const selectionUrl = `${baseUrl}#/area-selection`

  const { x, y, width, height } = screen.getPrimaryDisplay().bounds

  selectionWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
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
    minWidth: width,
    maxWidth: width,
    minHeight: height,
    maxHeight: height,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  selectionWindow.setResizable(false)
  selectionWindow.setMovable(false)
  selectionWindow.setAlwaysOnTop(true, 'screen-saver')
  selectionWindow.loadURL(selectionUrl)

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

// 销毁选择窗口
function destroySelectionWindow() {
  if (selectionWindow) {
    selectionWindow.setOpacity(0)
    selectionWindow.setIgnoreMouseEvents(true)
    selectionWindow.setAlwaysOnTop(false)

    const winToDestroy = selectionWindow
    selectionWindow = null

    setTimeout(() => {
      if (!winToDestroy.isDestroyed()) {
        winToDestroy.destroy()
      }
    }, 100)
  }
}

// IPC 处理器
ipcMain.on('start-area-selection', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createSelectionWindow()
})

ipcMain.on('area-selected', (_, area) => {
  // 选择区域后，切换到录制视觉模式，但【不销毁窗口】
  if (selectionWindow) {
    selectionWindow.setIgnoreMouseEvents(true)
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

ipcMain.on('recording-stopped', () => {
  // 录制结束后销毁选择窗口
  destroySelectionWindow()
})
```

## 5. Preload 暴露的 IPC 方法

```typescript
// src/preload/index.ts

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
},
```

## 6. Toolbar 中的处理

```tsx
// src/components/Toolbar.tsx

// 区域选择监听
useEffect(() => {
  const unlisten = window.caplet.onAreaSelected((area) => {
    setPendingAreaSelection(area)
    setSelectedSource('area')
    startPreWarming()
    startCountdown()
  })
  return () => unlisten()
}, [setSelectedSource, setPendingAreaSelection, startCountdown, onStartRecording])

// 点击区域按钮
if (source === 'area') {
  setSelectedSource(source)
  window.caplet.startAreaSelection()
  return
}
```

## 7. App.tsx 中的处理

```tsx
// src/App.tsx

// 监听区域选择取消
useEffect(() => {
  const unlisten = window.caplet.onAreaSelectionCancelled(() => {
    const store = useAppStore.getState()
    if (store.prepState === 'preparing' || store.prepState === 'ready') {
      cancelPreWarming()
    }
    useAppStore.getState().setSelectedSource('display')
  })
  return () => unlisten()
}, [])

// 提交录制时设置 activeCropArea
if (selectedSource === 'area' && pendingAreaSelection) {
  const { width: actualWidth, height: actualHeight } = getPrepRecordingDimensions()
  useAppStore.getState().setActiveCropArea({
    x: pendingAreaSelection.x,
    y: pendingAreaSelection.y,
    width: pendingAreaSelection.width,
    height: pendingAreaSelection.height,
    scaleX: actualWidth / window.screen.width,
    scaleY: actualHeight / window.screen.height
  })
}

// 停止录制时处理裁剪
if (wasAreaMode && cropArea) {
  const finalW = Math.floor((cropArea.width * cropArea.scaleX) / 2) * 2
  const finalH = Math.floor((cropArea.height * cropArea.scaleY) / 2) * 2
  const finalX = Math.floor((cropArea.x * cropArea.scaleX) / 2) * 2
  const finalY = Math.floor((cropArea.y * cropArea.scaleY) / 2) * 2
  cropParamsStr = `${finalW}:${finalH}:${finalX}:${finalY}`
}
```

## 8. 数据流程图

```
用户点击"区域"按钮
    ↓
Toolbar.tsx: handleSourceClick('area')
    ↓
window.caplet.startAreaSelection()
    ↓
IPC: 'start-area-selection'
    ↓
Main: ipcMain.on('start-area-selection')
    ↓
mainWindow.hide()
    ↓
createSelectionWindow() 创建透明全屏窗口
    ↓
窗口加载 area-selection 页面
    ↓
AreaOverlay 组件渲染
    ↓
用户拖拽选择区域
    ↓
用户按 Enter 确认
    ↓
AreaOverlay: onConfirm(selection)
    ↓
window.caplet.sendAreaSelected(area)
    ↓
IPC: 'area-selected'
    ↓
Main: ipcMain.on('area-selected')
    ↓
selectionWindow.webContents.send('switch-to-recording-visuals')
    ↓
AreaOverlay: onSwitchToRecordingVisuals() → isRecordingVisuals = true
    ↓
显示录制遮罩 (recording-hole mask)
    ↓
mainWindow.webContents.send('area-selected', area)
    ↓
App: onAreaSelected(area)
    ↓
store.setPendingAreaSelection(area)
    ↓
store.setSelectedSource('area')
    ↓
startPreWarming() + startCountdown()
    ↓
倒计时结束 → commitRecording()
    ↓
IPC: 'recording-stopped'
    ↓
Main: destroySelectionWindow() 销毁遮罩
```