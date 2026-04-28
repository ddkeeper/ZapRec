# Toolbar UI 代码文档

## 目录
1. [App.tsx 使用](#apptsx-使用)
2. [主进程窗口创建](#主进程窗口创建)
3. [Toolbar 组件](#toolbar-组件)

---

## App.tsx 使用

### 文件位置
`src/App.tsx`

### Toolbar 使用代码

```tsx
function App() {
  // ... 状态和逻辑
  
  const handleOpenWindowPicker = useCallback(() => {
    useAppStore.getState().setSelectedSource('window')
    window.caplet.startWindowPicker()
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Toolbar
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        isRecording={status === 'recording'}
        onOpenWindowPicker={handleOpenWindowPicker}
      />
    </div>
  )
}
```

### Props 接口

```typescript
interface ToolbarProps {
  onStartRecording: () => void
  onStopRecording: () => void
  isRecording: boolean
  onOpenWindowPicker?: () => void
}
```

---

## 主进程窗口创建

### 文件位置
`src/main/index.ts`

### createWindow 函数

```typescript
function createWindow() {
  const iconPath = getIconPath(256)
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 64,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('close', () => {
    destroySelectionWindow()
    destroyWindowPickerWindow()
    destroyPipWindow()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}
```

### 窗口尺寸 IPC

```typescript
ipcMain.on('resize-toolbar', (_, { width, height }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSize(width, height)
  }
})
```

### 窗口控制 IPC

```typescript
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window-close', () => {
  mainWindow?.close()
})
```

---

## Toolbar 组件

### 文件位置
`src/components/Toolbar.tsx`

### 组件结构

```tsx
export default function Toolbar({ onStartRecording, onStopRecording, isRecording, onOpenWindowPicker }: ToolbarProps) {
  const { status, countdownValue, microphoneEnabled, systemAudioEnabled, ... } = useAppStore()
  const { startCountdown } = useRecordingCountdown()
  const [recordingTime, setRecordingTime] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // 响应式尺寸监听
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.target.getBoundingClientRect()
        const width = Math.round(rect.width)
        const height = Math.round(rect.height)
        if (window.caplet?.resizeToolbar) {
          window.caplet.resizeToolbar(width, height)
        }
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // 计时器
  useEffect(() => {
    if (isRecording && !isPaused) {
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      return () => clearInterval(timer)
    } else if (!isRecording && !isPaused) {
      setRecordingTime(0)
    }
  }, [isRecording, isPaused])

  // 时间格式化
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 点击处理
  const handleSourceClick = useCallback((source: RecordingSource) => {
    if (status !== 'idle') return
    if (source === 'area') {
      setSelectedSource(source)
      window.caplet.startAreaSelection()
    } else if (source === 'window') {
      // ...
    } else {
      setSelectedSource(source)
      startPreWarming()
      startCountdown()
    }
  }, [status, setSelectedSource, startCountdown])

  return (
    <div 
      ref={containerRef}
      className="inline-flex items-center h-[60px] px-3 rounded-[20px] select-none transition-all duration-300 overflow-hidden"
      style={{
        backgroundColor: '#111828', 
        border: '3px solid #e2e8f0',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        boxSizing: 'border-box',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* 左侧按钮 */}
      <CrispDivider />
      {/* 中间区域 */}
      <CrispDivider />
      {/* 右侧音频开关 */}
      <CrispDivider />
      {/* 关闭按钮 */}
    </div>
  )
}
```

### 工具条样式 (style)

| 属性 | 值 |
|------|---|
| height | `60px` |
| padding | `px-3` (12px) |
| border-radius | `20px` (rounded-[20px]) |
| backgroundColor | `#111828` |
| border | `3px solid #e2e8f0` |
| boxShadow | `inset 0 0 0 1px rgba(255,255,255,0.1)` |

### CrispDivider 分割线

```tsx
const CrispDivider = () => (
  <svg width="2" height="42" className="mx-2.5 shrink-0" shapeRendering="crispEdges">
    <rect width="2" height="42" fill="#475569" />
  </svg>
)
```

| 属性 | 值 |
|------|---|
| width | `2px` |
| height | `42px` |
| fill | `#475569` |
| margin | `mx-2.5` |

### Lucide 图标导入

```typescript
import { 
  Settings, 
  Monitor, 
  AppWindow, 
  Square, 
  Video, 
  SquareUser, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX,
  Pause,
  Play,
  Undo2,
  X,
  Headphones
} from 'lucide-react'

const sourceIcons: Record<RecordingSource, typeof Monitor> = {
  display: Monitor,
  window: AppWindow,
  area: Square,
  camera: Video
}

const sourceLabels: Record<RecordingSource, string> = {
  display: '全屏',
  window: '窗口',
  area: '区域',
  camera: '镜头'
}
```

### 左侧：设置按钮

```tsx
<button
  onClick={() => {}}
  disabled={isRecording}
  className="flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 shrink-0 text-slate-300 hover:text-white hover:bg-[#1e293b] active:scale-95"
  style={{ WebkitAppRegion: 'no-drag' }}
  title="设置"
>
  <Settings size={20} strokeWidth={2} />
</button>
```

### 中间：录制源 (idle)

```tsx
{['display', 'window', 'area', 'camera'].map((source) => (
  <button
    key={source}
    onClick={() => handleSourceClick(source)}
    className="flex flex-col items-center justify-center w-[62px] h-[46px] rounded-xl transition-all duration-200 hover:bg-[#1e293b] active:scale-95 text-slate-300 hover:text-white group"
    title={titles[source]}
  >
    <IconComponent size={22} strokeWidth={1.5} className="group-hover:-translate-y-[1px]" />
    <span className="text-[11px] mt-0.5 font-medium">{sourceLabels[source]}</span>
  </button>
))}
```

### 中间：录制控制 (recording/paused)

```tsx
<>
  <div className="flex items-center gap-3 px-3">
    <div 
      className="w-2.5 h-2.5 rounded-full"
      style={{ backgroundColor: isPaused ? '#fbbf24' : '#ef4444' }}
    />
    <span className="font-mono text-white/95 text-[16px]">
      {formatTime(recordingTime)}
    </span>
  </div>
  <div className="flex items-center gap-2 ml-3">
    <button
      className="flex items-center justify-center w-[42px] h-[42px] rounded-xl text-slate-300 hover:text-white hover:bg-[#1e293b] active:scale-95"
      title={isPaused ? "恢复" : "暂停"}
    >
      {isPaused ? <Play size={20} strokeWidth={2.5} /> : <Pause size={20} strokeWidth={2.5} />}
    </button>
    <button
      className="flex items-center justify-center w-[42px] h-[42px] rounded-xl text-red-400/90 hover:text-red-400 hover:bg-[#451a1e] active:scale-95"
      title="停止录制"
    >
      <Square size={18} strokeWidth={2.5} fill="currentColor" />
    </button>
  </div>
</>
```

### 中间：倒计时 (countdown)

```tsx
<div className="flex items-center justify-center gap-2 px-3">
  <div className="flex items-center gap-2.5">
    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
    <span className="font-mono text-yellow-400/95 text-[14px]">
      即将开始: {countdownValue}s
    </span>
    {microphoneEnabled && systemAudioEnabled && (
      <div className="ml-2 px-2.5 py-1 bg-[#42361b] rounded-lg border border-yellow-600/30">
        <Headphones size={14} className="text-yellow-500/90" />
        <span className="text-[11px]">建议戴耳机</span>
      </div>
    )}
  </div>
  <button className="flex items-center justify-center w-[42px] h-[42px] ml-2 text-slate-400 hover:text-slate-100 hover:bg-[#1e293b]">
    <Undo2 size={20} strokeWidth={2} />
  </button>
</div>
```

### 右侧：音频开关

```tsx
<button
  onClick={() => {
    const newValue = !microphoneEnabled
    setMicrophoneEnabled(newValue)
    if (status === 'recording' || status === 'countdown') {
      audioMixer.setGain('microphone', newValue ? 1 : 0)
    }
  }}
  className={`flex items-center gap-1.5 px-3 h-[42px] rounded-xl border ${
    microphoneEnabled 
      ? 'bg-[#1e293b] text-white border-[#475569]' 
      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]'
  }`}
>
  {microphoneEnabled ? <Mic size={20} strokeWidth={1.5} /> : <MicOff size={20} strokeWidth={1.5} />}
  <span className="text-[13px]">麦克风</span>
</button>
```

### 右侧：关闭按钮

```tsx
<button
  onClick={() => window.caplet.windowMinimize()}
  className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-[#1e293b] transition-all duration-200 shrink-0 active:scale-95"
  style={{ WebkitAppRegion: 'no-drag' }}
  title="最小化到托盘"
>
  <X size={20} strokeWidth={2} />
</button>
```

---

## 样式常量

### 颜色

| 用途 | 颜色 |
|------|------|
| 工具条背景 | `#111828` |
| 工具条边框 | `#e2e8f0` |
| 分割线 | `#475569` |
| 按钮悬停 | `#1e293b` |
| 激活边框 | `#475569` |
| 录制指示灯 | `#ef4444` |
| 暂停指示灯 | `#fbbf24` |
| 倒计时文字 | `#facc15` |
| 警告提示背景 | `#42361b` |
| 停止按钮悬停 | `#451a1e` |

### 尺寸

| 用途 | 尺寸 |
|------|------|
| 工具条高度 | `60px` |
| 工具条内边距 | `12px` |
| 工具条圆角 | `20px` |
| 工具条边框 | `3px` |
| 分割线宽度 | `2px` |
| 分割线高度 | `42px` |
| 分割线边距 | `10px` |
| 小按钮尺寸 | `36px` |
| 中按钮尺寸 | `42px` |
| 录制源按钮 | `62px × 46px` |