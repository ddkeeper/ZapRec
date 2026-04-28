# 音频采集、摄像头采集与混合输出代码逻辑文档

## 目录

1. [核心模块概览](#1-核心模块概览)
2. [MediaCapturer 媒体采集器](#2-mediacapturer-媒体采集器)
3. [AudioMixer 音频混合器](#3-audiomixer-音频混合器)
4. [RecordingEngine 录制引擎](#4-recordingengine-录制引擎)
5. [主应用音频流程](#5-主应用音频流程)
6. [完整录制流程时序图](#6-完整录制流程时序图)

---

## 1. 核心模块概览

| 模块 | 文件 | 职责 |
|------|------|------|
| MediaCapturer | `src/core/MediaCapturer.ts` | 屏幕捕获、摄像头采集、麦克风采集 |
| AudioMixer | `src/core/AudioMixer.ts` | 多路音频混音混合 |
| RecordingEngine | `src/core/RecordingEngine.ts` | 视频音频轨道合成、编码、输出 |
| App.tsx | `src/App.tsx` | 业务逻辑编排 |

---

## 2. MediaCapturer 媒体采集器

**文件**: `src/core/MediaCapturer.ts`

### 2.1 类属性

```typescript
export class MediaCapturer {
  private displayStream: MediaStream | null = null      // 屏幕/窗口捕获流
  private microphoneStream: MediaStream | null = null    // 麦克风捕获流
  private cameraStream: MediaStream | null = null        // 摄像头捕获流
  private targetWindowId: string | null = null
  // ...
}
```

### 2.2 获取设备列表

```typescript
// 第 77-89 行
async getDisplaySources(): Promise<DesktopSource[]> {
  return window.caplet.getSources(['screen', 'window'])
}

async getCameraSources(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter(device => device.kind === 'videoinput')
}

async getMicrophoneSources(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter(device => device.kind === 'audioinput')
}
```

### 2.3 屏幕捕获

```typescript
// 第 91-110 行
async startDisplayCapture(sourceId: string): Promise<MediaStream> {
  this.stopDisplayCapture()
  
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        minWidth: 1280,
        maxWidth: 3840,
        minHeight: 720,
        maxHeight: 2160
      }
    } as MediaTrackConstraints
  }

  this.displayStream = await navigator.mediaDevices.getUserMedia(constraints)
  return this.displayStream
}
```

### 2.4 窗口捕获

```typescript
// 第 112-128 行
async startWindowCapture(windowId: string): Promise<MediaStream> {
  this.stopDisplayCapture()
  this.targetWindowId = windowId

  const constraints: MediaStreamConstraints = {
    audio: false,
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
```

### 2.5 麦克风采集

```typescript
// 第 138-151 行
async startMicrophoneCapture(): Promise<MediaStream> {
  this.stopMicrophoneCapture()
  
  this.microphoneStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,    // 回声消除
      noiseSuppression: true,   // 降噪
      sampleRate: 48000          // 采样率 48kHz
    },
    video: false
  })
  
  return this.microphoneStream
}
```

### 2.6 摄像头采集

```typescript
// 第 153-169 行
async startCameraCapture(audio: boolean = false, deviceId?: string): Promise<MediaStream> {
  this.stopCameraCapture()
  
  const videoConstraints: MediaTrackConstraints = {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 }
  }
  
  this.cameraStream = await navigator.mediaDevices.getUserMedia({
    audio: audio,  // 是否采集音频
    video: videoConstraints
  })
  
  return this.cameraStream
}
```

### 2.7 停止采集

```typescript
// 第 171-197 行
stopDisplayCapture(): void {
  if (this.displayStream) {
    this.displayStream.getTracks().forEach(track => track.stop())
    this.displayStream = null
  }
}

stopMicrophoneCapture(): void {
  if (this.microphoneStream) {
    this.microphoneStream.getTracks().forEach(track => track.stop())
    this.microphoneStream = null
  }
}

stopCameraCapture(): void {
  if (this.cameraStream) {
    this.cameraStream.getTracks().forEach(track => track.stop())
    this.cameraStream = null
  }
}

stopAll(): void {
  this.stopDisplayCapture()
  this.stopMicrophoneCapture()
  this.stopCameraCapture()
  this.targetWindowId = null
}
```

### 2.8 获取流引用

```typescript
// 第 199-206 行
getDisplayStream(): MediaStream | null {
  return this.displayStream
}

getMicrophoneStream(): MediaStream | null {
  return this.microphoneStream
}
```

### 2.9 单例导出

```typescript
// 第 208 行
export const mediaCapturer = new MediaCapturer()
```

---

## 3. AudioMixer 音频混合器

**文件**: `src/core/AudioMixer.ts`

### 3.1 类属性

```typescript
export class AudioMixer {
  private audioContext: AudioContext | null = null              // Web Audio 上下文
  private sourceNodes: Map<string, MediaStreamAudioSourceNode> = new Map()  // 音频源节点
  private gainNodes: Map<string, GainNode> = new Map()        // 增益节点（用于音量控制）
  private destinationNode: MediaStreamAudioDestinationNode | null = null  // 输出节点
  // ...
}
```

### 3.2 初始化

```typescript
// 第 7-14 行
async initialize(): Promise<void> {
  if (this.audioContext) {
    return
  }
  
  this.audioContext = new AudioContext()
  this.destinationNode = this.audioContext.createMediaStreamDestination()
}
```

### 3.3 添加音频流

```typescript
// 第 16-40 行
addStream(stream: MediaStream, name: string): MediaStream | null {
  if (!this.audioContext || !this.destinationNode) {
    console.error('AudioMixer not initialized')
    return null
  }

  this.removeStream(name)  // 先移除同名流

  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length === 0) {
    return null
  }

  // 创建音频节点链路：source → gain → destination
  const audioStream = new MediaStream(audioTracks)
  const sourceNode = this.audioContext.createMediaStreamSource(audioStream)
  const gainNode = this.audioContext.createGain()

  sourceNode.connect(gainNode)
  gainNode.connect(this.destinationNode)

  this.sourceNodes.set(name, sourceNode)
  this.gainNodes.set(name, gainNode)

  return this.destinationNode.stream
}
```

### 3.4 移除音频流

```typescript
// 第 42-55 行
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

### 3.5 设置音量

```typescript
// 第 57-62 行
setGain(name: string, value: number): void {
  const gainNode = this.gainNodes.get(name)
  if (gainNode) {
    gainNode.gain.value = value
  }
}
```

### 3.6 获取输出流

```typescript
// 第 64-66 行
getOutputStream(): MediaStream | null {
  return this.destinationNode?.stream || null
}
```

### 3.7 恢复/暂停音频上下文

```typescript
// 第 68-78 行
async resume(): Promise<void> {
  if (this.audioContext?.state === 'suspended') {
    await this.audioContext.resume()
  }
}

async suspend(): Promise<void> {
  if (this.audioContext?.state === 'running') {
    await this.audioContext.suspend()
  }
}
```

### 3.8 销毁

```typescript
// 第 80-93 行
destroy(): void {
  this.sourceNodes.forEach((node) => node.disconnect())
  this.gainNodes.forEach((node) => node.disconnect())
  this.destinationNode?.stream.getTracks().forEach(track => track.stop())
  
  this.sourceNodes.clear()
  this.gainNodes.clear()
  this.destinationNode = null
  
  if (this.audioContext) {
    this.audioContext.close()
    this.audioContext = null
  }
}
```

### 3.9 单例导出

```typescript
// 第 96 行
export const audioMixer = new AudioMixer()
```

---

## 4. RecordingEngine 录制引擎

**文件**: `src/core/RecordingEngine.ts`

### 4.1 IPC 可写流封装

```typescript
// 第 17-43 行
class IPCWritableStream {
  private pendingWrites: Promise<unknown>[] = []

  getWritable(): WritableStream<StreamTargetChunk> {
    return new WritableStream({
      write: async (chunk: StreamTargetChunk) => {
        if (chunk.type === 'write' && window.caplet) {
          const writePromise = window.caplet.streamWrite(chunk.data).then(() => {})
          this.pendingWrites.push(writePromise)
          await writePromise
        }
      },
      close: async () => {
        console.log('[RecordingEngine] Stream closing, waiting for writes...')
        await Promise.all(this.pendingWrites)
        console.log('[RecordingEngine] All writes completed')
      },
      abort: (err: Error) => {
        console.error('[RecordingEngine] Stream aborted:', err)
      }
    })
  }

  clear(): void {
    this.pendingWrites = []
  }
}
```

### 4.2 初始化

```typescript
// 第 53-76 行
async initialize(
  _config: RecordingConfig,
  _onData: (chunk: Uint8Array) => void
): Promise<boolean> {
  try {
    this.writableStream = new IPCWritableStream()

    this.streamTarget = new StreamTarget(this.writableStream.getWritable(), {
      chunked: false
    })

    this.output = new Output({
      format: new Mp4OutputFormat({ 
        fastStart: 'in-memory'
      }),
      target: this.streamTarget
    })

    return true
  } catch (error) {
    console.error('Failed to initialize RecordingEngine:', error)
    return false
  }
}
```

### 4.3 添加视频轨道

```typescript
// 第 78-103 行
addVideoTrack(stream: MediaStream, width?: number, height?: number): boolean {
  if (!this.output) return false

  try {
    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) {
      console.error('No video track found')
      return false
    }

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
```

### 4.4 添加音频轨道

```typescript
// 第 105-126 行
addAudioTrack(stream: MediaStream): boolean {
  if (!this.output) return false

  try {
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) {
      console.log('No audio track found')
      return false
    }

    this.audioSource = new MediaStreamAudioTrackSource(audioTrack, {
      codec: 'aac',
      bitrate: 128000
    })

    this.output.addAudioTrack(this.audioSource)
    return true
  } catch (error) {
    console.error('Failed to add audio track:', error)
    return false
  }
}
```

### 4.5 开始录制

```typescript
// 第 128-138 行
async start(): Promise<void> {
  if (!this.output) return
  
  try {
    await this.output.start()
    this.isRecording = true
    console.log('[RecordingEngine] Recording started')
  } catch (error) {
    console.error('Failed to start recording:', error)
  }
}
```

### 4.6 停止录制

```typescript
// 第 140-160 行
async stop(): Promise<void> {
  this.isRecording = false
  console.log('[RecordingEngine] Stopping recording...')

  if (this.output) {
    try {
      await this.output.finalize()
      console.log('[RecordingEngine] Recording finalized, waiting for writes...')
      await new Promise(resolve => setTimeout(resolve, 1000))
      console.log('[RecordingEngine] All writes should be complete now')
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

### 4.7 单例导出

```typescript
// 第 167 行
export const recordingEngine = new RecordingEngine()
```

---

## 5. 主应用音频流程

**文件**: `src/App.tsx`

### 5.1 开始录制（音频部分）

```typescript
// 第 298-323 行
if (sysAudioEnabled || micEnabled) {
  await audioMixer.initialize()

  // 系统音：从原始全屏流（displayStreamRef）里取音轨，而非裁剪后的流
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
```

### 5.2 摄像头录制

```typescript
// 第 226-257 行
} else if (currentSource === 'camera') {
  const pendingSettings = state.pendingCameraSettings
  if (!pendingSettings) {
    console.error('[ZapRec] Camera mode but no pending settings')
    await window.caplet.streamEnd()
    restorePipState()
    setStatus('idle')
    return
  }
  
  displayStream = await mediaCapturer.startCameraCapture(micEnabled, pendingSettings.deviceId)
  displayStreamRef.current = displayStream
  
  const videoTrack = displayStream.getVideoTracks()[0]
  if (videoTrack) {
    const settings = videoTrack.getSettings()
    
    recordingWidth = settings.width || quality.width
    recordingHeight = settings.height || quality.height
    
    if (recordingWidth % 2 !== 0) recordingWidth--
    if (recordingHeight % 2 !== 0) recordingHeight--

    useAppStore.getState().setPendingCameraSettings(null)
  }
}
```

### 5.3 停止录制

```typescript
const stopRecording = useCallback(async () => {
  try {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const wasCameraMode = useAppStore.getState().selectedSource === 'camera'
    const wasAreaMode = useAppStore.getState().selectedSource === 'area'
    const savedPip = useAppStore.getState().savedPipEnabled
    const cropArea = useAppStore.getState().activeCropArea

    useAppStore.getState().reset()
    setStatus('idle')

    if (wasCameraMode) {
      window.caplet.closeCameraPreviewWindow()
    }

    mediaCapturer.stopAll()
    audioMixer.destroy()

    displayStreamRef.current = null
    systemAudioStreamRef.current = null
    micStreamRef.current = null

    if (wasCameraMode && savedPip) {
      restorePipState()
    }

    ;(async () => {
      try {
        const filePath = await recordingEngine.stopAndSave()
        await window.caplet.streamEnd()
        window.caplet.sendRecordingStopped()

        if (wasAreaMode && cropArea && filePath) {
          const finalW = Math.floor((cropArea.width * cropArea.scaleX) / 2) * 2
          const finalH = Math.floor((cropArea.height * cropArea.scaleY) / 2) * 2
          const finalX = Math.floor((cropArea.x * cropArea.scaleX) / 2) * 2
          const finalY = Math.floor((cropArea.y * cropArea.scaleY) / 2) * 2

          window.caplet.processAreaCrop({
            filePath,
            cropParams: `${finalW}:${finalH}:${finalX}:${finalY}`
          })
          setStatus('processing')
        }
      } catch (e) {
        console.error('[ZapRec] Background cleanup error:', e)
      }
    })()

  } catch (error) {
    console.error('[ZapRec] Failed to stop recording:', error)
    useAppStore.getState().reset()
    setStatus('idle')
  }
}, [setStatus, restorePipState])
```

---

## 6. 完整录制流程时序图

```
┌─────────────────────────────────────────────────────────────────────┐
│                     音频采集与混合流程                                │
└─────────────────────────────────────────────────────────────────────┘

开始录制（麦克风开 或 系统音开）
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ App.tsx:298-323                                                     │
│   if (sysAudioEnabled || micEnabled) {                              │
│       await audioMixer.initialize()                                  │
│                                                                        │
│       if (sysAudioEnabled && displayStreamRef.current) {            │
│           // 从原始全屏流获取系统音频轨                              │
│           audioTracks = displayStreamRef.current.getAudioTracks()   │
│           systemStream = new MediaStream([audioTracks[0]])          │
│           audioMixer.addStream(systemStream, 'system')              │
│       }                                                              │
│                                                                        │
│       if (micEnabled) {                                              │
│           // 采集麦克风                                               │
│           micStream = mediaCapturer.startMicrophoneCapture()        │
│           audioMixer.addStream(micStream, 'microphone')             │
│       }                                                              │
│                                                                        │
│       await audioMixer.resume()                                     │
│       mixedStream = audioMixer.getOutputStream()                     │
│       recordingEngine.addAudioTrack(mixedStream)                     │
│   }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AudioMixer 内部链路                                │
│                                                                        │
│   systemStream ──► sourceNode ──► gainNode ──┐                       │
│                                              │                       │
│   microphoneStream ──► sourceNode ──► gainNode ──► destinationNode    │
│                                              │                       │
│                                              ▼                       │
│                                    destinationNode.stream            │
│                                    (混合后的 MediaStream)            │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ App.tsx:325                                                          │
│   await recordingEngine.start()                                      │
└─────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                     摄像头录制流程                                   │
└─────────────────────────────────────────────────────────────────────┘

开始录制（selectedSource === 'camera'）
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ App.tsx:226-257                                                      │
│                                                                        │
│   displayStream = mediaCapturer.startCameraCapture(                   │
│       micEnabled,          // 是否采集音频                            │
│       deviceId             // 设备 ID                                │
│   )                                                                    │
│                                                                        │
│   displayStreamRef.current = displayStream                            │
│                                                                        │
│   // 获取视频尺寸                                                     │
│   videoTrack = displayStream.getVideoTracks()[0]                      │
│   settings = videoTrack.getSettings()                                 │
│   recordingWidth = settings.width || quality.width                    │
│   recordingHeight = settings.height || quality.height                 │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ App.tsx:296                                                          │
│   recordingEngine.addVideoTrack(displayStream,                        │
│       recordingWidth, recordingHeight)                                 │
└─────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                     停止录制流程                                      │
└─────────────────────────────────────────────────────────────────────┘

用户停止录制
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ App.tsx:stopRecording                                                 │
│                                                                        │
│   recordingEngine.stopAndSave()  // finalize 输出，关闭流               │
│   window.caplet.streamEnd()  // 关闭文件写入                          │
│                                                                        │
│   audioMixer.destroy()  // 销毁音频混合器                           │
│   mediaCapturer.stopAll()  // 停止所有媒体采集                       │
│                                                                        │
│   displayStreamRef.current = null                                     │
│   systemAudioStreamRef.current = null                                 │
│   micStreamRef.current = null                                         │
│                                                                        │
│   window.caplet.sendRecordingStopped()  // 通知主进程                 │
│                                                                        │
│   // area 模式：触发 FFmpeg 裁剪                                     │
│   window.caplet.processAreaCrop(...)                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 关键代码索引

| 功能 | 文件 | 行号 |
|------|------|------|
| MediaCapturer 类定义 | `src/core/MediaCapturer.ts` | 71-207 |
| 屏幕捕获 | `src/core/MediaCapturer.ts` | 91-110 |
| 窗口捕获 | `src/core/MediaCapturer.ts` | 112-128 |
| 麦克风采集 | `src/core/MediaCapturer.ts` | 138-151 |
| 摄像头采集 | `src/core/MediaCapturer.ts` | 153-169 |
| 停止所有采集 | `src/core/MediaCapturer.ts` | 192-197 |
| AudioMixer 类定义 | `src/core/AudioMixer.ts` | 1-96 |
| 音频混合器初始化 | `src/core/AudioMixer.ts` | 7-14 |
| 添加音频流 | `src/core/AudioMixer.ts` | 16-40 |
| 获取混合输出流 | `src/core/AudioMixer.ts` | 64-66 |
| 销毁音频混合器 | `src/core/AudioMixer.ts` | 80-93 |
| RecordingEngine 类定义 | `src/core/RecordingEngine.ts` | 45-165 |
| IPC 可写流封装 | `src/core/RecordingEngine.ts` | 17-43 |
| 录制引擎初始化 | `src/core/RecordingEngine.ts` | 53-76 |
| 添加视频轨道 | `src/core/RecordingEngine.ts` | 78-103 |
| 添加音频轨道 | `src/core/RecordingEngine.ts` | 105-126 |
| 开始录制 | `src/core/RecordingEngine.ts` | 128-138 |
| 停止录制 | `src/core/RecordingEngine.ts` | 140-160 |
| 音频混音流程 | `src/App.tsx` | 298-323 |
| 摄像头录制流程 | `src/App.tsx` | 226-257 |
| 停止录制清理 | `src/App.tsx` | 349-397 |
