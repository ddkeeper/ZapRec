# 窗口选择器与区域选择器代码逻辑文档

## 目录

1. [Preload API 暴露](#1-preload-api-暴露)
2. [主进程 IPC 处理](#2-主进程-ipc-处理)
3. [主应用路由与组件](#3-主应用路由与组件)
4. [Toolbar 触发逻辑](#4-toolbar-触发逻辑)
5. [窗口选择器组件](#5-窗口选择器组件)
6. [区域选择器组件](#6-区域选择器组件)
7. [完整流程时序图](#7-完整流程时序图)

---

## 1. Preload API 暴露

**文件**: `src/preload/index.ts`

### 区域选择相关 API

```typescript
// 第 17-19 行
startAreaSelection: () => ipcRenderer.send('start-area-selection'),
cancelAreaSelection: () => ipcRenderer.send('cancel-area-selection'),
sendAreaSelected: (area: { x: number; y: number; width: number; height: number }) => 
  ipcRenderer.send('area-selected', area),

// 第 21-36 行
onAreaSelected: (callback: (area: {...}) => void) => {
  const handler = (_: unknown, area: {...}) => callback(area)
  ipcRenderer.on('area-selected', handler)
  return () => ipcRenderer.removeListener('area-selected', handler)
},
onAreaSelectionCancelled: (callback: () => void) => {...},
onSwitchToRecordingVisuals: (callback: () => void) => {...},
```

### 窗口选择器相关 API

```typescript
// 第 58-73 行
startWindowPicker: () => ipcRenderer.send('start-window-picker'),
cancelWindowPicker: () => ipcRenderer.send('cancel-window-picker'),
sendWindowSelected: (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => {
  ipcRenderer.send('window-selected', windowData)
},
onWindowSelected: (callback: (...) => void) => {...},
onWindowSelectionCancelled: (callback: () => void) => {...},
```

---

## 2. 主进程 IPC 处理

**文件**: `src/main/index.ts`

### 2.1 窗口选择器窗口创建

**函数**: `createWindowPickerWindow()` (第 329-385 行)

```typescript
function createWindowPickerWindow() {
  if (windowPickerWindow) {
    windowPickerWindow.close()
  }

  const rawUrl = mainWindow?.webContents.getURL() || ''
  const baseUrl = rawUrl.split('#')[0]
  const pickerUrl = `${baseUrl}#/window-picker`

  const { x, y, width, height } = screen.getPrimaryDisplay().bounds

  windowPickerWindow = new BrowserWindow({
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

  windowPickerWindow.setResizable(false)
  windowPickerWindow.setMovable(false)
  windowPickerWindow.setAlwaysOnTop(true, 'screen-saver')

  windowPickerWindow.loadURL(pickerUrl)

  if (process.platform === 'win32') {
    windowPickerWindow.hookWindowMessage(0x0084, (_e, result) => {
      result.writeInt32LE(1, 0)
      return true
    })
  }

  windowPickerWindow.on('closed', () => {
    windowPickerWindow = null
  })
}
```

### 2.2 区域选择窗口创建

**函数**: `createSelectionWindow()` (第 249-317 行)

```typescript
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

  if (process.platform === 'darwin') {
    selectionWindow.setWindowButtonVisibility(false)
  }

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
```

### 2.3 窗口选择器 IPC 监听

```typescript
// 第 552-573 行
ipcMain.on('start-window-picker', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createWindowPickerWindow()
})

ipcMain.on('cancel-window-picker', () => {
  destroyWindowPickerWindow()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('window-selection-cancelled')
  }
})

ipcMain.on('window-selected', (_, windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => {
  destroyWindowPickerWindow()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('window-selected', windowData)
  }
})
```

### 2.4 区域选择 IPC 监听

```typescript
// 第 709-745 行
ipcMain.on('start-area-selection', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createSelectionWindow()
})

ipcMain.on('area-selected', (_, area: { x: number; y: number; width: number; height: number }) => {
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
```

---

## 3. 主应用路由与组件

**文件**: `src/App.tsx`

### 3.1 路由判断 (第 14-32 行)

```typescript
function App() {
  const isAreaSelectionMode = window.location.hash === '#/area-selection'
  const isCameraPreviewMode = window.location.hash === '#/camera-preview'
  const isWindowPickerMode = window.location.hash === '#/window-picker'

  if (isCameraPreviewMode) {
    return <CameraPreviewOverlay ... />
  }

  if (isAreaSelectionMode) {
    return <AreaOverlayForSelectionWindow />
  }

  if (isWindowPickerMode) {
    return <WindowPickerForSelectionWindow />
  }
  // ...
}
```

### 3.2 AreaOverlayForSelectionWindow 组件 (第 543-551 行)

```typescript
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

### 3.3 WindowPickerForSelectionWindow 组件 (第 553-561 行)

```typescript
function WindowPickerForSelectionWindow() {
  const handleSelect = (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => {
    window.caplet.sendWindowSelected(windowData)
  }
  const handleCancel = () => {
    window.caplet.cancelWindowPicker()
  }
  return <WindowPicker onSelect={handleSelect} onCancel={handleCancel} />
}
```

---

## 4. Toolbar 触发逻辑

**文件**: `src/components/Toolbar.tsx`

### 4.1 点击处理 (第 111-146 行)

```typescript
const handleSourceClick = useCallback((source: RecordingSource) => {
  if (status !== 'idle') return
  
  if (source === 'area') {
    setSelectedSource(source)
    window.caplet.startAreaSelection()
    return
  }
  
  if (source === 'window') {
    const store = useAppStore.getState()
    if (store.pipEnabled) {
      store.setSavedPipEnabled(true)
      store.setPipEnabled(false)
    }
    store.setPipButtonDisabled(true)
    setSelectedSource(source)
    onOpenWindowPicker?.()
    return
  }

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
  
  setSelectedSource(source)
  startCountdown(() => onStartRecording())
}, [status, setSelectedSource, startCountdown, onStartRecording, onOpenWindowPicker])
```

### 4.2 handleOpenWindowPicker (第 524-527 行)

```typescript
const handleOpenWindowPicker = useCallback(() => {
  useAppStore.getState().setSelectedSource('window')
  window.caplet.startWindowPicker()
}, [])
```

---

## 5. 窗口选择器组件

**文件**: `src/components/WindowPicker.tsx`

### 5.1 完整组件代码

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { DesktopSource } from '../shared/types'
import { LayoutGrid } from 'lucide-react'

interface WindowPickerProps {
  onSelect: (window: DesktopSource) => void
  onCancel: () => void
}

export default function WindowPicker({ onSelect, onCancel }: WindowPickerProps) {
  const [windows, setWindows] = useState<DesktopSource[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredWindow, setHoveredWindow] = useState<string | null>(null)

  useEffect(() => {
    loadWindows()
  }, [])

  const loadWindows = async () => {
    setLoading(true)
    try {
      const sources = await window.caplet.getSources(['window'])
      setWindows(sources)
    } catch (error) {
      console.error('[WindowPicker] Failed to load windows:', error)
    }
    setLoading(false)
  }

  const handleSelect = useCallback((window: DesktopSource) => {
    onSelect(window)
  }, [onSelect])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }, [onCancel])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* 顶部提示 */}
      <div className="fixed top-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm text-white flex gap-6"
        style={{ backgroundColor: 'rgba(30, 30, 30, 0.92)', border: '2px solid rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(10px)', zIndex: 10001 }}>
        <span className="flex items-center gap-2"><LayoutGrid size={16} /> 选择要录制的窗口</span>
        <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded">Esc</kbd> 取消</span>
      </div>

      {/* 窗口选择对话框 */}
      <div
        className="w-[800px] h-[50vh] min-h-[400px] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{
          backgroundColor: 'rgba(28, 28, 30, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="p-4 overflow-y-auto flex-1 bg-black/20">
          {loading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-zinc-500 text-sm">正在获取桌面窗口...</span>
            </div>
          ) : windows.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <span className="text-zinc-500 text-sm">未检测到可录制的窗口（最小化的窗口无法录制）</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {windows.map((win) => (
                <button
                  key={win.id}
                  onClick={() => handleSelect(win)}
                  onMouseEnter={() => setHoveredWindow(win.id)}
                  onMouseLeave={() => setHoveredWindow(null)}
                  className="group relative flex flex-col rounded-xl overflow-hidden transition-all duration-200 text-left"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: hoveredWindow === win.id ? '2px solid #3b82f6' : '2px solid transparent',
                    boxShadow: hoveredWindow === win.id ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
                    transform: hoveredWindow === win.id ? 'translateY(-2px)' : 'none',
                  }}
                >
                  <div className="relative aspect-video bg-black/60 w-full overflow-hidden">
                    <img
                      src={win.thumbnail}
                      alt="thumbnail"
                      className="w-full h-full object-contain"
                      draggable={false}
                      onError={(e) => (e.currentTarget.style.display = 'none')} 
                    />
                    {hoveredWindow === win.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20 backdrop-blur-sm transition-all">
                        <div className="px-4 py-1.5 rounded-full bg-blue-600 shadow-lg">
                          <span className="text-white text-sm font-medium">点击录制</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex items-center gap-3 w-full border-t border-white/5 bg-white/[0.02]">
                    {win.appIcon ? (
                      <img src={win.appIcon} alt="icon" className="w-5 h-5 rounded-sm shrink-0" draggable={false} />
                    ) : (
                      <div className="w-5 h-5 rounded-sm bg-white/10 shrink-0" />
                    )}
                    <span className="text-zinc-300 text-sm font-medium truncate flex-1" title={win.name}>
                      {win.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## 6. 区域选择器组件

**文件**: `src/components/AreaOverlay.tsx`

### 6.1 完整组件代码

```typescript
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
  }, [isRecordingVisuals])

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
      {/* 遮罩层（会镂空） */}
      {!isRecordingVisuals && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="selection-mask">
              <rect width="100%" height="100%" fill="white" />
              {selection && (
                <rect x={selection.x} y={selection.y} width={selection.width} height={selection.height} fill="black" />
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
            backgroundColor: 'rgba(30, 30, 30, 0.92)',
            border: '2px solid rgba(255, 255, 255, 0.45)',
            backdropFilter: 'blur(10px)',
            zIndex: 10001,
          }}>
          <span className="flex items-center gap-2"><SquareMousePointer size={16} /> 拖拽选择录制区域</span>
          <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded">Enter</kbd> 确认</span>
          <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded">Esc</kbd> 取消</span>
        </div>
      )}

      {/* 录制中遮罩 */}
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
            {Math.round(selection.width)} × {Math.round(selection.height)}
          </div>
        </div>
      )}
    </div>
  )
}
```
