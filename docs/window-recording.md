# 窗口录制代码完整文档

## 1. 核心组件：WindowPicker.tsx

```tsx
// src/components/WindowPicker.tsx
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

  // 组件加载后延迟加载窗口列表
  useEffect(() => {
    const timer = setTimeout(() => {
      loadWindows()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // 加载桌面窗口列表
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

  // 选择窗口回调
  const handleSelect = useCallback((window: DesktopSource) => {
    onSelect(window)
  }, [onSelect])

  // ESC 取消
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }, [onCancel])

  // 键盘事件监听
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
        style={{
          backgroundColor: 'rgba(17, 24, 40, 0.95)',
          border: '2px solid rgba(255, 255, 255, 0.35)',
          backdropFilter: 'blur(10px)',
          zIndex: 10001
        }}>
        <span className="flex items-center gap-2"><LayoutGrid size={16} /> 选择要录制的窗口</span>
        <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded">Esc</kbd> 取消</span>
      </div>

      {/* 窗口选择对话框 */}
      <div
        className="w-[800px] h-[50vh] min-h-[400px] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{
          backgroundColor: 'rgba(17, 24, 40, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="p-4 overflow-y-auto flex-1 bg-black/20">
          {loading ? (
            // 加载中状态
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-zinc-500 text-sm">正在获取桌面窗口...</span>
            </div>
          ) : windows.length === 0 ? (
            // 无窗口状态
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <span className="text-zinc-500 text-sm">未检测到可录制的窗口（最小化的窗口无法录制）</span>
            </div>
          ) : (
            // 窗口列表
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
                    border: hoveredWindow === win.id 
                      ? '2px solid #3b82f6' 
                      : '2px solid transparent',
                    boxShadow: hoveredWindow === win.id ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
                    transform: hoveredWindow === win.id ? 'translateY(-2px)' : 'none',
                  }}
                >
                  {/* 窗口缩略图 */}
                  <div className="relative aspect-video bg-black/60 w-full overflow-hidden">
                    <img
                      src={win.thumbnail}
                      alt="thumbnail"
                      className="w-full h-full object-contain"
                      draggable={false}
                      onError={(e) => (e.currentTarget.style.display = 'none')} 
                    />
                    {/* 悬停提示 */}
                    {hoveredWindow === win.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20 backdrop-blur-sm transition-all">
                        <div className="px-4 py-1.5 rounded-full bg-blue-600 shadow-lg">
                          <span className="text-white text-sm font-medium">点击录制</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* 窗口标题 */}
                  <div className="p-3 flex items-center gap-3 w-full border-t border-white/5 bg-white/[0.02]">
                    {win.appIcon ? (
                      <img
                        src={win.appIcon}
                        alt="icon"
                        className="w-5 h-5 rounded-sm shrink-0"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-sm bg-white/10 shrink-0" />
                    )}
                    <span 
                      className="text-zinc-300 text-sm font-medium truncate flex-1"
                      title={win.name}
                    >
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

## 2. 页面入口：window-picker 模式

```tsx
// src/App.tsx 或 src/window-picker.tsx

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

## 3. Store 状态管理

```typescript
// src/store/useAppStore.ts

export interface WindowInfo {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
}

interface AppStore extends AppState {
  selectedWindow: WindowInfo | null
  setSelectedWindow: (window: WindowInfo | null) => void
}

// 初始化状态
selectedWindow: null,

// 方法实现
setSelectedWindow: (window) => set({ selectedWindow: window }),

// reset 中重置
selectedWindow: null,
```

## 4. 主进程 IPC 处理

```typescript
// src/main/index.ts

// 全局变量
let windowPickerWindow: BrowserWindow | null = null

// 创建窗口选择器窗口
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

// 销毁窗口选择器窗口
function destroyWindowPickerWindow() {
  if (windowPickerWindow) {
    windowPickerWindow.close()
    windowPickerWindow = null
  }
}

// IPC 处理器
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

ipcMain.on('window-selected', (_, windowData) => {
  destroyWindowPickerWindow()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('window-selected', windowData)
  }
})
```

## 5. Preload 暴露的 IPC 方法

```typescript
// src/preload/index.ts

getSources: (types: string[]) => ipcRenderer.invoke('get-sources', types),

startWindowPicker: () => ipcRenderer.send('start-window-picker'),
cancelWindowPicker: () => ipcRenderer.send('cancel-window-picker'),
sendWindowSelected: (windowData) => ipcRenderer.send('window-selected', windowData),

onWindowSelected: (callback) => {
  const handler = (_, windowData) => callback(windowData)
  ipcRenderer.on('window-selected', handler)
  return () => ipcRenderer.removeListener('window-selected', handler)
},

onWindowSelectionCancelled: (callback) => {
  const handler = () => callback()
  ipcRenderer.on('window-selection-cancelled', handler)
  return () => ipcRenderer.removeListener('window-selection-cancelled', handler)
},
```

## 6. Toolbar 中的处理

```tsx
// src/components/Toolbar.tsx

// 窗口按钮点击处理
if (source === 'window' || source === 'camera') {
  const store = useAppStore.getState()
  // 保存 PIP 状态
  if (store.pipEnabled) {
    store.setSavedPipEnabled(true)
    store.setPipEnabled(false)
  }
  store.setPipButtonDisabled(true)
  setSelectedSource(source)
  if (source === 'window') onOpenWindowPicker?.()
  else window.caplet.startCameraPreview()
  return
}

// 窗口选择回调
useEffect(() => {
  const unlisten = window.caplet.onAreaSelected((area) => {
    setPendingAreaSelection(area)
    setSelectedSource('area')
    startPreWarming()
    startCountdown()
  })
  return () => unlisten()
}, [...])
```

## 7. App.tsx 中的处理

```tsx
// src/App.tsx

// 打开窗口选择器
const handleOpenWindowPicker = useCallback(() => {
  useAppStore.getState().setSelectedSource('window')
  window.caplet.startWindowPicker()
}, [])

// 监听窗口选择
useEffect(() => {
  const unlistenWindowSelected = window.caplet.onWindowSelected((windowData) => {
    useAppStore.getState().setSelectedWindow(windowData)
    startPreWarming()
    startCountdown()
  })

  const unlistenWindowCancelled = window.caplet.onWindowSelectionCancelled(() => {
    const store = useAppStore.getState()
    if (store.prepState === 'preparing' || store.prepState === 'ready') {
      cancelPreWarming()
    }
    if (store.savedPipEnabled) {
      store.setPipEnabled(true)
    }
    store.setSavedPipEnabled(null)
    store.setPipButtonDisabled(false)
    store.setSelectedSource('display')
  })

  return () => {
    unlistenWindowSelected()
    unlistenWindowCancelled()
  }
}, [startCountdown, startRecording])

// 窗口录制开始逻辑
if (currentSource === 'window') {
  const windowInfo = state.selectedWindow
  if (!windowInfo) {
    console.error('[ZapRec] Window mode but no window selected')
    return
  }
  displayStream = await mediaCapturer.startWindowCapture(windowInfo.id)
  displayStreamRef.current = displayStream
  
  // 获取实际分辨率
  const videoTrack = displayStream.getVideoTracks()[0]
  if (videoTrack) {
    const getRealDimensions = (stream: MediaStream) => {
      return new Promise((resolve) => {
        const video = document.createElement('video')
        video.srcObject = stream
        video.muted = true
        video.onloadedmetadata = () => {
          resolve({ width: video.videoWidth, height: video.videoHeight })
          video.srcObject = null
        }
        video.play().catch(() => {})
      })
    }
    const realSize = await getRealDimensions(displayStream)
    recordingWidth = realSize.width
    recordingHeight = realSize.height
    if (recordingWidth % 2 !== 0) recordingWidth--
    if (recordingHeight % 2 !== 0) recordingHeight--
    
    // 监听窗口关闭
    videoTrack.onended = () => {
      console.warn('[ZapRec] 目标窗口已关闭，自动停止并保存录制')
      stopRecording()
    }
  }
}
```

## 8. MediaCapturer 窗口捕获

```typescript
// src/core/MediaCapturer.ts

private targetWindowId: string | null = null

async startWindowCapture(windowId: string): Promise<MediaStream> {
  this.stopDisplayCapture()
  this.targetWindowId = windowId

  const constraints: MediaStreamConstraints = {
    audio: { mandatory: { chromeMediaSource: 'desktop' } } as MediaTrackConstraints,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: windowId
      }
    } as MediaTrackConstraints
  }

  this.displayStream = await navigator.mediaDevices.getUserMedia(constraints)
  return this.displayStream
}

getTargetWindowId(): string | null {
  return this.targetWindowId
}

clearTargetWindowId(): void {
  this.targetWindowId = null
}
```

## 9. 数据流程图

```
用户点击"窗口"按钮
    ↓
Toolbar.tsx: handleSourceClick('window')
    ↓
保存 PIP 状态 → setPipButtonDisabled(true)
    ↓
setSelectedSource('window')
    ↓
onOpenWindowPicker() → handleOpenWindowPicker()
    ↓
window.caplet.startWindowPicker()
    ↓
IPC: 'start-window-picker'
    ↓
Main: ipcMain.on('start-window-picker')
    ↓
mainWindow.hide()
    ↓
createWindowPickerWindow() 创建透明全屏窗口
    ↓
窗口加载 window-picker 页面
    ↓
WindowPicker 组件渲染
    ↓
window.caplet.getSources(['window'])
    ↓
IPC: 'get-sources'
    ↓
Main: desktopCapturer.getSources()
    ↓
返回窗口列表
    ↓
用户选择窗口 或 按 ESC
    ↓
【选择窗口】
WindowPicker: handleSelect(window)
    ↓
window.caplet.sendWindowSelected(windowData)
    ↓
IPC: 'window-selected'
    ↓
Main: ipcMain.on('window-selected')
    ↓
destroyWindowPickerWindow()
    ↓
mainWindow.show()
    ↓
mainWindow.webContents.send('window-selected', windowData)
    ↓
App: onWindowSelected(windowData)
    ↓
store.setSelectedWindow(windowData)
    ↓
startPreWarming() + startCountdown()
    ↓
倒计时结束 → commitRecording()
    ↓
recordingEngine.start()
    ↓
【按 ESC】
WindowPicker: handleKeyDown('Escape')
    ↓
WindowPicker: onCancel()
    ↓
window.caplet.cancelWindowPicker()
    ↓
IPC: 'cancel-window-picker'
    ↓
Main: ipcMain.on('cancel-window-picker')
    ↓
destroyWindowPickerWindow()
    ↓
mainWindow.show()
    ↓
mainWindow.webContents.send('window-selection-cancelled')
    ↓
App: onWindowSelectionCancelled()
    ↓
cancelPreWarming() + restorePipState()
    ↓
store.setSelectedSource('display')
```   