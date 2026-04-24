# 画中画 (PiP) 相关代码整理

## 目录

1. [状态管理](#1-状态管理)
2. [UI 层](#2-ui-层)
3. [媒体捕获层](#3-媒体捕获层)
4. [录制引擎](#4-录制引擎)
5. [IPC 通信](#5-ipc-通信)
6. [主进程窗口管理](#6-主进程窗口管理)
7. [现有 Canvas 混合机制](#7-现有-canvas-混合机制)
8. [画中画组合使用逻辑](#8-画中画组合使用逻辑)

---

## 1. 状态管理

### `src/shared/types.ts`

```typescript
// 行 9-11: CameraSettings 接口
export interface CameraSettings {
  deviceId: string
}

// 行 13: RecordingSource 类型定义（包含 'camera' 但用于纯摄像头录制，PiP 复用此类型）
export type RecordingSource = 'display' | 'window' | 'area' | 'camera'

// 行 35: cameraEnabled 状态定义
export interface AppState {
  cameraEnabled: boolean   // ← 画中画开关状态
  // ...
}

// 行 42-50: DEFAULT_SETTINGS
export const DEFAULT_SETTINGS: AppSettings = {
  quality: '1080p',
  countdown: 3,
  // ...
}
```

### `src/store/useAppStore.ts`

```typescript
// 行 45: cameraEnabled 初始值
cameraEnabled: false,

// 行 62: setCameraEnabled setter
setCameraEnabled: (enabled: boolean) => set({ cameraEnabled: enabled }),

// 行 69-79: reset 函数（reset 时会重置 cameraEnabled? 否，reset 未包含 cameraEnabled）
reset: () => set({
  // 注意：reset 未重置 cameraEnabled，需确认是否需要
})
```

---

## 2. UI 层

### `src/components/Toolbar.tsx`

```typescript
// 行 53-54: 从 store 解构 cameraEnabled 和 setCameraEnabled
const {
  cameraEnabled,
  setCameraEnabled
} = useAppStore()

// 行 280-289: 画中画按钮 UI
<button
  onClick={() => setCameraEnabled(!cameraEnabled)}
  className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all shrink-0 hover:bg-white/10"
  title={cameraEnabled ? "画中画：关闭" : "画中画：开启"}
>
  <SquareUser size={18} strokeWidth={2} color={cameraEnabled ? 'white' : 'rgba(255,255,255,0.4)'} />
  <span className={`text-sm whitespace-nowrap font-medium ${cameraEnabled ? 'text-white' : 'text-white/40'}`}>
    画中画
  </span>
</button>
```

### `src/components/CameraPreviewOverlay.tsx`

```typescript
// 行 1-7: Props 接口
interface Props {
  onConfirm: (settings: CameraSettings) => void
  onCancel: () => void
}

// 行 9-13: 组件状态
export default function CameraPreviewOverlay({ onConfirm, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [stream, setStream] = useState<MediaStream | null>(null)

// 行 15-23: 枚举设备
useEffect(() => {
  navigator.mediaDevices.enumerateDevices().then(allDevices => {
    const videoDevices = allDevices.filter(d => d.kind === 'videoinput')
    setDevices(videoDevices)
    if (videoDevices.length > 0 && !deviceId) {
      setDeviceId(videoDevices[0].deviceId)
    }
  }).catch(console.error)
}, [])

// 行 25-51: 切换设备时重新获取摄像头流
useEffect(() => {
  if (!deviceId) return
  if (stream) {
    stream.getTracks().forEach(t => t.stop())
  }
  let newStream: MediaStream | null = null
  navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
  }).then(s => {
    newStream = s
    setStream(s)
    if (videoRef.current) {
      videoRef.current.srcObject = s
    }
  }).catch(err => {
    console.error('[CameraPreview] Failed to get camera stream:', err)
  })
  return () => {
    if (newStream) {
      newStream.getTracks().forEach(t => t.stop())
    }
  }
}, [deviceId])
```

---

## 3. 媒体捕获层

### `src/core/MediaCapturer.ts`

```typescript
// 行 1-38: window.caplet 全局类型声明
declare global {
  interface Window {
    caplet: {
      // ... 其他方法
      startCameraPreview: () => void
      cancelCameraPreview: () => void
      sendCameraSettingsConfirmed: (settings: CameraSettings) => void
      onCameraSettingsConfirmed: (callback: (settings: CameraSettings) => void) => () => void
      onCameraPreviewCancelled: (callback: () => void) => () => void
    }
  }
}

// 行 54-58: MediaCapturer 类属性
export class MediaCapturer {
  private displayStream: MediaStream | null = null
  private microphoneStream: MediaStream | null = null
  private cameraStream: MediaStream | null = null  // ← 画中画摄像头流

// 行 64-67: 获取摄像头设备列表
async getCameraSources(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter(device => device.kind === 'videoinput')
}

// 行 136-152: startCameraCapture 方法
async startCameraCapture(audio: boolean = false, deviceId?: string): Promise<MediaStream> {
  this.stopCameraCapture()
  
  const videoConstraints: MediaTrackConstraints = {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 }
  }
  
  this.cameraStream = await navigator.mediaDevices.getUserMedia({
    audio: audio,
    video: videoConstraints
  })
  
  return this.cameraStream
}

// 行 168-173: stopCameraCapture 方法
stopCameraCapture(): void {
  if (this.cameraStream) {
    this.cameraStream.getTracks().forEach(track => track.stop())
    this.cameraStream = null
  }
}

// 行 175-180: stopAll 方法
stopAll(): void {
  this.stopDisplayCapture()
  this.stopMicrophoneCapture()
  this.stopCameraCapture()
  this.targetWindowId = null
}
```

---

## 4. 录制引擎

### `src/core/RecordingEngine.ts`

```typescript
// 行 45-51: RecordingEngine 类属性
export class RecordingEngine {
  private output: Output | null = null
  private streamTarget: StreamTarget | null = null
  private writableStream: IPCWritableStream | null = null
  private videoSource: MediaStreamVideoTrackSource | null = null  // ← 仅支持单个视频源
  private audioSource: MediaStreamAudioTrackSource | null = null
  private isRecording = false

// 行 78-103: addVideoTrack 方法（当前仅支持单个视频轨道）
addVideoTrack(stream: MediaStream, width?: number, height?: number): boolean {
  if (!this.output) return false
  try {
    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) {
      console.error('No video track found')
      return false
    }
    // 仅处理第一个视频轨道，PiP 需要扩展此处
    this.videoSource = new MediaStreamVideoTrackSource(videoTrack, {
      codec: 'avc',
      bitrate: QUALITY_HIGH,
      ...(width && height ? { width, height } : {})
    })
    this.output.addVideoTrack(this.videoSource)
    console.log(`[RecordingEngine] Video track added (${width ?? 'auto'}x${height ?? 'auto'})`)
    return true
  } catch (error) {
    console.error('Failed to add video track:', error)
    return false
  }
}

// 行 140-160: stop 方法
async stop(): Promise<void> {
  this.isRecording = false
  if (this.output) {
    try {
      await this.output.finalize()
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      console.error('Error finalizing output:', error)
    }
    this.output = null
  }
  this.streamTarget = null
  this.writableStream = null
  this.videoSource = null
  this.audioSource = null
}
```

---

## 5. IPC 通信

### `src/preload/index.ts`

```typescript
// 行 67-82: 摄像头预览相关 IPC 方法
startCameraPreview: () => ipcRenderer.send('start-camera-preview'),
cancelCameraPreview: () => ipcRenderer.send('cancel-camera-preview'),
sendCameraSettingsConfirmed: (settings: { deviceId: string }) => {
  ipcRenderer.send('camera-settings-confirmed', settings)
},
onCameraSettingsConfirmed: (callback: (settings: { deviceId: string }) => void) => {
  const handler = (_: unknown, settings: { deviceId: string }) => callback(settings)
  ipcRenderer.on('camera-settings-confirmed', handler)
  return () => ipcRenderer.removeListener('camera-settings-confirmed', handler)
},
onCameraPreviewCancelled: (callback: () => void) => {
  const handler = () => callback()
  ipcRenderer.on('camera-preview-cancelled', handler)
  return () => ipcRenderer.removeListener('camera-preview-cancelled', handler)
}
```

---

## 6. 主进程窗口管理

### `src/main/index.ts`

```typescript
// 行 29: cameraPreviewWindow 变量声明
let cameraPreviewWindow: BrowserWindow | null = null

// 行 381-435: createCameraPreviewWindow 函数
function createCameraPreviewWindow() {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
  }
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds
  cameraPreviewWindow = new BrowserWindow({
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
  cameraPreviewWindow.setResizable(false)
  cameraPreviewWindow.setMovable(false)
  cameraPreviewWindow.setAlwaysOnTop(true, 'screen-saver')
  if (VITE_DEV_SERVER_URL) {
    cameraPreviewWindow.loadURL(`${VITE_DEV_SERVER_URL.replace('/index.html', '')}/camera-preview.html`)
  } else {
    cameraPreviewWindow.loadFile(path.join(__dirname, '../../dist/camera-preview.html'))
  }
  if (process.platform === 'win32') {
    cameraPreviewWindow.hookWindowMessage(0x0084, (_e, result) => {
      result.writeInt32LE(1, 0)
      return true
    })
  }
  cameraPreviewWindow.on('closed', () => {
    cameraPreviewWindow = null
  })
}

// 行 466-493: 摄像头预览 IPC 处理
ipcMain.on('start-camera-preview', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createCameraPreviewWindow()
})

ipcMain.on('cancel-camera-preview', () => {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
    cameraPreviewWindow = null
  }
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('camera-preview-cancelled')
  }
})

ipcMain.on('camera-settings-confirmed', (_, settings: { deviceId: string }) => {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
    cameraPreviewWindow = null
  }
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('camera-settings-confirmed', settings)
  }
})

// 行 90-94: 主窗口关闭时清理
mainWindow.on('close', () => {
  destroySelectionWindow()
  destroyWindowPickerWindow()
  // 注意：未清理 cameraPreviewWindow，需补充
})
```

---

## 7. 现有 Canvas 混合机制

### `src/App.tsx`

```typescript
// 行 36-38: Canvas 相关 refs
const canvasRef = useRef<HTMLCanvasElement | null>(null)
const videoElementRef = useRef<HTMLVideoElement | null>(null)
const cropIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

// 行 43-129: createCroppedStream 函数（现有画布裁剪逻辑，可扩展为 PiP 混合）
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

  const mainVideo = document.createElement('video')
  mainVideo.srcObject = new MediaStream([mainVideoTrack])
  mainVideo.muted = true
  mainVideo.autoplay = true
  mainVideo.playsInline = true
  videoElementRef.current = mainVideo

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

  let physicalX = 0
  let physicalY = 0
  let physicalW = vw
  let physicalH = vh

  const screenWidth = window.screen.width
  const currentScale = (vw > 0 && screenWidth > 0) ? (vw / screenWidth) : (window.devicePixelRatio || 1)

  physicalX = Math.round(area.x * currentScale)
  physicalY = Math.round(area.y * currentScale)
  physicalW = Math.round(area.width * currentScale)
  physicalH = Math.round(area.height * currentScale)

  physicalX = Math.max(0, Math.min(physicalX, vw))
  physicalY = Math.max(0, Math.min(physicalY, vh))
  physicalW = Math.min(physicalW, vw - physicalX)
  physicalH = Math.min(physicalH, vh - physicalY)

  physicalW = physicalW % 2 === 0 ? physicalW : physicalW - 1
  physicalH = physicalH % 2 === 0 ? physicalH : physicalH - 1

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

  // 30fps 定时器刷新画布
  cropIntervalRef.current = setInterval(() => {
    const v = videoElementRef.current
    if (!v || v.readyState < 2) return
    ctx.drawImage(v, physicalX, physicalY, physicalW, physicalH, 0, 0, physicalW, physicalH)
  }, 1000 / 30)

  return canvas.captureStream(30)

// 行 131-141: stopCropStream 函数
const stopCropStream = useCallback(() => {
  if (cropIntervalRef.current) {
    clearInterval(cropIntervalRef.current)
    cropIntervalRef.current = null
  }
  if (videoElementRef.current) {
    videoElementRef.current.srcObject = null
    videoElementRef.current = null
  }
  canvasRef.current = null
}, [])

// 行 321-351: stopRecording 函数
const stopRecording = useCallback(async () => {
  try {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
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
    window.caplet.sendRecordingStopped()
  } catch (error) {
    console.error('[ZapRec] Failed to stop recording:', error)
    await window.caplet.streamEnd()
    useAppStore.getState().reset()
    setStatus('idle')
    window.caplet.sendRecordingStopped()
  }
}, [setStatus, stopCropStream])
```

### `src/core/AudioMixer.ts`

```typescript
// 行 1-5: AudioMixer 类属性（PiP 音频混音可复用此机制）
export class AudioMixer {
  private audioContext: AudioContext | null = null
  private sourceNodes: Map<string, MediaStreamAudioSourceNode> = new Map()
  private gainNodes: Map<string, GainNode> = new Map()
  private destinationNode: MediaStreamAudioDestinationNode | null = null

// 行 16-40: addStream 方法（支持多个音频流混音，可参考实现 PiP 视频混合）
addStream(stream: MediaStream, name: string): MediaStream | null {
  if (!this.audioContext || !this.destinationNode) {
    console.error('AudioMixer not initialized')
    return null
  }
  this.removeStream(name)
  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length === 0) {
    return null
  }
  const audioStream = new MediaStream(audioTracks)
  const sourceNode = this.audioContext.createMediaStreamSource(audioStream)
  const gainNode = this.audioContext.createGain()
  sourceNode.connect(gainNode)
  gainNode.connect(this.destinationNode)
  this.sourceNodes.set(name, sourceNode)
  this.gainNodes.set(name, gainNode)
  return this.destinationNode.stream
}

// 行 42-55: removeStream 方法
removeStream(name: string): void {
  const sourceNode = this.sourceNodes.get(name)
  const gainNode = this.gainNodes.get(name)
  if (sourceNode) {
    sourceNode.disconnect()
    this.sourceNodes.delete(name)
  }
  if (gainNode) {
    gainNode.disconnect()
    this.gainNodes.delete(name)
  }
}
```

---

## 8. 画中画组合使用逻辑

### 当前录制流程 (`src/App.tsx`)

```typescript
// 行 143-319: startRecording 函数
const startRecording = useCallback(async () => {
  // 行 146-154: 从 store 获取状态
  const state = useAppStore.getState()
  const currentSource = state.selectedSource
  const currentSourceId = state.selectedSourceId
  const currentSettings = state.settings
  const micEnabled = state.microphoneEnabled
  const sysAudioEnabled = state.systemAudioEnabled

  // 行 158-162: 流初始化和变量声明
  await window.caplet.streamStart(filepath)
  let displayStream: MediaStream | null = null
  let recordingWidth = quality.width
  let recordingHeight = quality.height

  // 行 164-167: display 模式
  if (currentSource === 'display') {
    const sourceId = currentSourceId || 'screen:0:0'
    displayStream = await mediaCapturer.startDisplayCapture(sourceId)
    displayStreamRef.current = displayStream

  // 行 169-206: window 模式
  } else if (currentSource === 'window') {
    const windowInfo = state.selectedWindow
    displayStream = await mediaCapturer.startWindowCapture(windowInfo.id)
    displayStreamRef.current = displayStream
    // 获取实际窗口尺寸...

  // 行 208-237: camera 模式（纯摄像头录制，非 PiP）
  } else if (currentSource === 'camera') {
    const pendingSettings = state.pendingCameraSettings
    displayStream = await mediaCapturer.startCameraCapture(micEnabled, pendingSettings.deviceId)
    displayStreamRef.current = displayStream
    // 获取实际摄像头分辨率...

  // 行 239-262: area 模式
  } else if (currentSource === 'area') {
    const pendingArea = state.pendingAreaSelection
    const rawStream = await mediaCapturer.startDisplayCapture('screen:0:0')
    displayStreamRef.current = rawStream
    displayStream = await createCroppedStream(rawStream, pendingArea)
    if (canvasRef.current) {
      recordingWidth = canvasRef.current.width
      recordingHeight = canvasRef.current.height
    }
  }

  // 行 271-276: 初始化录制引擎并添加视频轨道
  await recordingEngine.initialize({ width: recordingWidth, height: recordingHeight, fps: quality.fps }, () => {})
  recordingEngine.addVideoTrack(displayStream, recordingWidth, recordingHeight)

  // 行 278-303: 音频混音（可扩展支持 PiP 摄像头音频）
  if (sysAudioEnabled || micEnabled) {
    await audioMixer.initialize()
    if (sysAudioEnabled && displayStreamRef.current) {
      const audioTracks = displayStreamRef.current.getAudioTracks()
      if (audioTracks.length > 0) {
        const systemStream = new MediaStream([audioTracks[0]])
        systemAudioStreamRef.current = systemStream
        audioMixer.addStream(systemStream, 'system')
      }
    }
    if (micEnabled) {
      const micStream = await mediaCapturer.startMicrophoneCapture()
      micStreamRef.current = micStream
      audioMixer.addStream(micStream, 'microphone')
    }
    await audioMixer.resume()
    const mixedStream = audioMixer.getOutputStream()
    if (mixedStream && mixedStream.getAudioTracks().length > 0) {
      recordingEngine.addAudioTrack(mixedStream)
    }
  }

  await recordingEngine.start()
  setLastSavedPath(filepath)
  setStatus('recording')
}, [defaultPath, setStatus, setLastSavedPath, createCroppedStream])
```

### Toolbar 中的摄像头预览启动 (`src/components/Toolbar.tsx`)

```typescript
// 行 105-109: camera 按钮点击处理
if (source === 'camera') {
  setSelectedSource(source)
  window.caplet.startCameraPreview()
  return
}

// 行 197-217: 倒计时取消按钮（camera 模式清理）
onClick={() => {
  const store = useAppStore.getState()
  store.setStatus('idle')
  store.setCountdownValue(0)
  if (store.selectedSource === 'area') {
    window.caplet.cancelAreaSelection()
    store.setPendingAreaSelection(null)
  } else if (store.selectedSource === 'window') {
    store.setSelectedWindow(null)
  } else if (store.selectedSource === 'camera') {
    store.setPendingCameraSettings(null)
  }
}}
```

### App.tsx 中的摄像头预览确认监听

```typescript
// 行 397-404: onCameraSettingsConfirmed 监听
useEffect(() => {
  const unlisten = window.caplet.onCameraSettingsConfirmed((settings) => {
    useAppStore.getState().setPendingCameraSettings(settings)
    useAppStore.getState().setSelectedSource('camera')
    startCountdown(() => startRecording())
  })
  return () => unlisten()
}, [startCountdown, startRecording])
```

---

## 现有可复用的基础设施

1. **Canvas 混合机制** (`src/App.tsx:43-129`): `createCroppedStream` 已实现主视频流 + Canvas 混合，可扩展为 PiP 混合
2. **AudioMixer** (`src/core/AudioMixer.ts`): 已实现多音频流混音，可直接复用
3. **CameraPreviewOverlay** (`src/components/CameraPreviewOverlay.tsx`): 已有摄像头预览 UI，可复用设备选择逻辑
4. **MediaCapturer** (`src/core/MediaCapturer.ts`): 已有 `startCameraCapture` 和 `stopCameraCapture` 方法
5. **倒计时逻辑** (`src/hooks/useRecordingCountdown.ts`): 已有统一倒计时 hook，PiP 可复用
