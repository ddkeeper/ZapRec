# 音频录制与混音代码文档

## 概述

ZapRec 支持双路音频实时混音：系统内部声音 (system) + 麦克风输入 (microphone)。两路音频通过 Web Audio API 在内存中实时混合为单一立体声流，送入录制引擎。

---

## 1. 音频混音器 (AudioMixer)

### 1.1 核心类实现

**文件**: `src/core/AudioMixer.ts` (全文件 169 行)

```typescript
export class AudioMixer {
  private audioContext: AudioContext | null = null
  private sourceNodes: Map<string, MediaStreamAudioSourceNode> = new Map()
  private highpassFilterNodes: Map<string, BiquadFilterNode> = new Map()
  private deEsserFilterNodes: Map<string, BiquadFilterNode> = new Map()
  private lowpassFilterNodes: Map<string, BiquadFilterNode> = new Map()
  private gainNodes: Map<string, GainNode> = new Map()
  private compressorNode: DynamicsCompressorNode | null = null
  private destinationNode: MediaStreamAudioDestinationNode | null = null

  async initialize(): Promise<void> {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      return
    }
    
    this.audioContext = new AudioContext({ sampleRate: 48000 })
    this.destinationNode = this.audioContext.createMediaStreamDestination()
    
    this.compressorNode = this.audioContext.createDynamicsCompressor()
    this.compressorNode.threshold.value = -10.0
    this.compressorNode.knee.value = 15
    this.compressorNode.ratio.value = 3.5
    this.compressorNode.attack.value = 0.003
    this.compressorNode.release.value = 0.1
    this.compressorNode.connect(this.destinationNode)
  }

  addStream(stream: MediaStream, name: string): MediaStream | null {
    if (!this.audioContext || !this.destinationNode || !this.compressorNode) {
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

    if (name === 'microphone') {
      const highpass = this.audioContext.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 70

      const deEsser = this.audioContext.createBiquadFilter()
      deEsser.type = 'peaking'
      deEsser.frequency.value = 6000
      deEsser.Q.value = 2.0
      deEsser.gain.value = -3.0

      const lowpass = this.audioContext.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 12000

      gainNode.gain.value = 1.0

      sourceNode.connect(highpass)
      highpass.connect(deEsser)
      deEsser.connect(lowpass)
      lowpass.connect(gainNode)
      gainNode.connect(this.compressorNode)

      this.highpassFilterNodes.set(name, highpass)
      this.deEsserFilterNodes.set(name, deEsser)
      this.lowpassFilterNodes.set(name, lowpass)
    } else if (name === 'system') {
      gainNode.gain.value = 0.65
      sourceNode.connect(gainNode)
      gainNode.connect(this.compressorNode)
    }

    this.sourceNodes.set(name, sourceNode)
    this.gainNodes.set(name, gainNode)

    return this.destinationNode.stream
  }

  setGain(name: string, value: number): void {
    const gainNode = this.gainNodes.get(name)
    if (gainNode && this.audioContext) {
      gainNode.gain.exponentialRampToValueAtTime(
        Math.max(value, 0.0001),
        this.audioContext.currentTime + 0.05
      )
    }
  }

  getOutputStream(): MediaStream | null {
    return this.destinationNode?.stream || null
  }

  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume()
    }
  }

  destroy(): void {
    this.sourceNodes.forEach((node) => node.disconnect())
    this.highpassFilterNodes.forEach((node) => node.disconnect())
    this.deEsserFilterNodes.forEach((node) => node.disconnect())
    this.lowpassFilterNodes.forEach((node) => node.disconnect())
    this.gainNodes.forEach((node) => node.disconnect())
    this.destinationNode?.stream.getTracks().forEach(track => track.stop())
    
    if (this.compressorNode) {
      this.compressorNode.disconnect()
      this.compressorNode = null
    }
    
    this.sourceNodes.clear()
    this.highpassFilterNodes.clear()
    this.deEsserFilterNodes.clear()
    this.lowpassFilterNodes.clear()
    this.gainNodes.clear()
    this.destinationNode = null
    
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

export const audioMixer = new AudioMixer()
```

### 1.2 音频处理流程

| 轨道 | 滤波器链 | 用途 |
|------|----------|------|
| microphone | highpass(70Hz) → deEsser(6kHz, -3dB) → lowpass(12kHz) → gain(1.0) | 麦克风降噪 |
| system | gain(0.65) | 系统音量调节 |
| 合并 | → compressor → destination | 动态压缩 + 输出 |

---

## 2. 系统音频捕获 (从屏幕/窗口捕获)

### 2.1 全屏捕获

**文件**: `src/core/MediaCapturer.ts` (行 99-123)

```typescript
async startDisplayCapture(
    sourceId: string,
    width?: number,
    height?: number
  ): Promise<MediaStream> {
    this.stopDisplayCapture()
    
    const maxWidth = width || 1920
    const maxHeight = height || 1080

    const constraints: MediaStreamConstraints = {
      audio: { mandatory: { chromeMediaSource: 'desktop' } } as MediaTrackConstraints,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth,
          maxHeight
        }
      } as MediaTrackConstraints
    }

    this.displayStream = await navigator.mediaDevices.getUserMedia(constraints)
    return this.displayStream
  }
```

### 2.2 窗口捕获

**文件**: `src/core/MediaCapturer.ts` (行 125-141)

```typescript
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
```

### 2.3 系统音频提取

在 App.tsx 中从 displayStream 提取音频轨道：

```typescript
if (displayStreamRef.current) {
  const audioTracks = displayStreamRef.current.getAudioTracks()
  if (audioTracks.length > 0) {
    const systemStream = new MediaStream([audioTracks[0]])
    systemAudioStreamRef.current = systemStream
    const isSystemAdded = audioMixer.addStream(systemStream, 'system')
    if (isSystemAdded) {
      audioMixer.setGain('system', systemAudioEnabled ? 1 : 0)
    }
  }
}
```

### 2.4 捕获参数说明

| 参数 | 值 | 说明 |
|------|-----|------|
| chromeMediaSource | 'desktop' | Electron 专用，从桌面捕获系统声音 |
| chromeMediaSourceId | sourceId/windowId | 指定捕获源 (screen:0:0 或窗口ID) |
| maxWidth/maxHeight | 1920x1080 | 视频分辨率限制 |

---

## 3. 麦克风捕获

**文件**: `src/core/MediaCapturer.ts` (行 151-162)

```typescript
async startMicrophoneCapture(): Promise<MediaStream> {
  this.stopMicrophoneCapture()
  
  this.microphoneStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      googNoiseSuppression2: true,
      googHighpassFilter: false,
      googTypingNoiseDetection: false
    }
  })
  
  return this.microphoneStream
}
```

---

## 4. 状态管理

**文件**: `src/store/useAppStore.ts`

```typescript
// 初始状态 (行 70-71)
microphoneEnabled: false,
systemAudioEnabled: false,

// Setter (行 93-94)
setMicrophoneEnabled: (enabled: boolean) => set({ microphoneEnabled: enabled }),
setSystemAudioEnabled: (enabled: boolean) => set({ systemAudioEnabled: enabled }),
```

---

## 5. Toolbar 音频开关

**文件**: `src/components/Toolbar.tsx`

### 4.1 麦克风按钮 (行 321-339)
```typescript
<button
  onClick={() => {
    const newValue = !microphoneEnabled
    setMicrophoneEnabled(newValue)
    if (status === 'recording' || status === 'countdown') {
      audioMixer.setGain('microphone', newValue ? 1 : 0)
    }
  }}
  title={microphoneEnabled ? "麦克风：关闭" : "麦克风：开启"}
>
  {microphoneEnabled
    ? <Mic size={18} strokeWidth={2} color="white" />
    : <MicOff size={18} strokeWidth={2} color="rgba(255,255,255,0.4)" />
  }
  <span className={...}>
    麦克风
  </span>
</button>
```

### 4.2 系统音按钮 (行 341-359)
```typescript
<button
  onClick={() => {
    const newValue = !systemAudioEnabled
    setSystemAudioEnabled(newValue)
    if (status === 'recording' || status === 'countdown') {
      audioMixer.setGain('system', newValue ? 1 : 0)
    }
  }}
  title={systemAudioEnabled ? "系统声音：关闭" : "系统声音：开启"}
>
  {systemAudioEnabled
    ? <Volume2 size={18} strokeWidth={2} color="white" />
    : <VolumeX size={18} strokeWidth={2} color="rgba(255,255,255,0.4)" />
  }
  <span className={...}>
    系统音
  </span>
</button>
```

---

## 6. App.tsx 音频初始化

**文件**: `src/App.tsx` (行 252-284)

```typescript
await audioMixer.initialize()

// 系统音：从 display 流提取
if (displayStreamRef.current) {
  const audioTracks = displayStreamRef.current.getAudioTracks()
  if (audioTracks.length > 0) {
    const systemStream = new MediaStream([audioTracks[0]])
    systemAudioStreamRef.current = systemStream
    const isSystemAdded = audioMixer.addStream(systemStream, 'system')
    if (isSystemAdded) {
      audioMixer.setGain('system', systemAudioEnabled ? 1 : 0)
    }
  }
}

// 麦克风：独立捕获
const micStream = await mediaCapturer.startMicrophoneCapture()
micStreamRef.current = micStream
const isMicAdded = audioMixer.addStream(micStream, 'microphone')
if (isMicAdded) {
  audioMixer.setGain('microphone', microphoneEnabled ? 1 : 0)
}

await audioMixer.resume()

// 添加到录制引擎
const mixedStream = audioMixer.getOutputStream()
if (mixedStream && mixedStream.getAudioTracks().length > 0) {
  recordingEngine.addAudioTrack(mixedStream)
}
```

---

## 7. 结束录制清理

**文件**: `src/App.tsx` (行 332-341)

```typescript
if (systemAudioStreamRef.current) {
  systemAudioStreamRef.current.getTracks().forEach(track => track.stop())
  systemAudioStreamRef.current = null
}
if (micStreamRef.current) {
  micStreamRef.current.getTracks().forEach(track => track.stop())
  micStreamRef.current = null
}
audioMixer.destroy()
displayStreamRef.current = null
```

---

## 8. 流程图

```
录制开始
  ├─ audioMixer.initialize()
  │   └─ 创建 AudioContext (48kHz)
  │   └─ 创建 MediaStreamDestination
  │   └─ 创建 DynamicsCompressor
  │
  ├─ displayStream.getAudioTracks()[0]
  │   └─ audioMixer.addStream(systemStream, 'system')
  │       └─ gain = 0.65
  │
  ├─ mediaCapturer.startMicrophoneCapture()
  │   └─ audioMixer.addStream(micStream, 'microphone')
  │       └─ highpass → deEsser → lowpass → gain = 1.0
  │
  ├─ audioMixer.setGain('system', enabled ? 1 : 0)
  ├─ audioMixer.setGain('microphone', enabled ? 1 : 0)
  ├─ audioMixer.resume()
  │
  └─ audioMixer.getOutputStream()
      └─ recordingEngine.addAudioTrack(mixedStream)
         ↓
录制中 (Toolbar 切换)
  ├─ 点击麦克风按钮
  │   └─ setMicrophoneEnabled(!microphoneEnabled)
  │   └─ audioMixer.setGain('microphone', newValue ? 1 : 0)
  │
  └─ 点击系统音按钮
      └─ setSystemAudioEnabled(!systemAudioEnabled)
      └─ audioMixer.setGain('system', newValue ? 1 : 0)
         ↓
录制结束
  ├─ systemAudioStreamRef.current.stop()
  ├─ micStreamRef.current.stop()
  ├─ audioMixer.destroy()
  └─ 清理所有节点
```

---

## 9. 相关文件

| 文件 | 职责 |
|------|------|
| `src/core/AudioMixer.ts` | 音频混音器类实现 |
| `src/core/MediaCapturer.ts` | 系统音频/麦克风捕获 |
| `src/components/Toolbar.tsx` | 音频开关按钮 |
| `src/App.tsx` | 音频初始化与清理 |
| `src/store/useAppStore.ts` | 音频开关状态 |