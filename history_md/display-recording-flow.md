# 全屏录制流程代码整理

## 完整流程图

```
用户点击"全屏"按钮
      │
      ▼
Toolbar.handleSourceClick('display')
  ├─ setSelectedSource('display')
  └─ startCountdown(() => onStartRecording())
      │
      ▼
useRecordingCountdown Hook
  ├─ setCountdownValue(countdownSeconds)
  ├─ setStatus('countdown')
  └─ 开启读秒 interval
      │
      ▼
Toolbar UI: status === 'countdown' 分支
  └─ 显示"即将开始: Xs" + Undo2 取消按钮
      │
      ├─── 用户点击 Undo2 ──→ setStatus('idle')
      │                     countdown hook 检测到 status !== 'countdown' → 清理定时器
      │                     → 恢复显示录制源按钮（无额外清理，display 无残留状态）
      │
      └─── 倒计时结束 (count <= 0)
              ↓
          onStartRecording() → App.tsx
              │
              ▼
          startRecording()
              ├─ 从 store 读取 currentSource === 'display'
              ├─ currentSourceId || 'screen:0:0'
              ├─ mediaCapturer.startDisplayCapture(sourceId)
              ├─ recordingEngine.initialize()
              ├─ recordingEngine.addVideoTrack(displayStream, ...)
              ├─ [可选] audioMixer.addStream(systemStream, 'system')
              ├─ [可选] audioMixer.addStream(micStream, 'microphone')
              ├─ recordingEngine.start()
              └─ setStatus('recording')
                  │
                  ▼
              Toolbar UI: 显示录制计时器 + 停止按钮
```

---

## 代码分布

### 1. 类型定义

**文件**: `src/shared/types.ts`

```typescript
export type RecordingSource = 'display' | 'window' | 'area' | 'camera'

export type RecordingStatus = 'idle' | 'countdown' | 'recording' | 'paused'
```

**默认值**: `selectedSource: 'display'` (初始即为全屏模式)

---

### 2. Store 状态

**文件**: `src/store/useAppStore.ts`

```typescript
selectedSource: 'display',           // 默认录制源
selectedSourceId: null,              // 屏幕源 ID (display 模式使用)
status: 'idle',                      // 录制状态
microphoneEnabled: false,            // 麦克风开关
systemAudioEnabled: false,           // 系统音频开关

setSelectedSource: (source) => set({ selectedSource: source }),
setSelectedSourceId: (id) => set({ selectedSourceId: id }),
setStatus: (status) => set({ status }),
```

---

### 3. 触发全屏录制 (Toolbar.tsx)

**文件**: `src/components/Toolbar.tsx` 第 91-113 行

```typescript
const handleSourceClick = useCallback((source: RecordingSource) => {
  if (status !== 'idle') return

  // area/window/camera 提前 return

  // 全屏模式：设置源 + 启动倒计时
  setSelectedSource(source)
  startCountdown(() => onStartRecording())
}, [status, setSelectedSource, startCountdown, onStartRecording, onOpenWindowPicker])
```

**职责**: 用户点击"全屏"按钮，设置选中源为 `display`，启动倒计时。

---

### 4. 倒计时取消 (Toolbar.tsx)

**文件**: `src/components/Toolbar.tsx` 第 197-216 行

```typescript
<button
  onClick={() => {
    const store = useAppStore.getState()
    store.setStatus('idle')
    store.setCountdownValue(0)
    // display 模式无额外残留状态，无需清理
  }}
  className="p-1 text-gray-400 hover:text-white..."
>
  <Undo2 size={16} />
</button>
```

**特点**: 全屏模式取消时无需通知主进程清理，无 pending 数据需清空。

---

### 5. 启动屏幕捕获 (MediaCapturer.ts)

**文件**: `src/core/MediaCapturer.ts` 第 74-93 行

```typescript
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

---

### 6. 录制启动核心逻辑 (App.tsx)

**文件**: `src/App.tsx` 第 143-180 行

```typescript
const startRecording = useCallback(async () => {
  try {
    const state = useAppStore.getState()
    const currentSource = state.selectedSource
    const currentSourceId = state.selectedSourceId
    const currentSettings = state.settings
    const micEnabled = state.microphoneEnabled
    const sysAudioEnabled = state.systemAudioEnabled

    const quality = QUALITY_PRESETS[currentSettings.quality]
    const outputDir = currentSettings.outputDirectory || defaultPath || ''
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
    const filepath = `${outputDir}/ZapRec_${timestamp}.mp4`

    await window.caplet.streamStart(filepath)

    let displayStream: MediaStream | null = null
    let recordingWidth = quality.width
    let recordingHeight = quality.height

    if (currentSource === 'display') {
      const sourceId = currentSourceId || 'screen:0:0'
      displayStream = await mediaCapturer.startDisplayCapture(sourceId)
      displayStreamRef.current = displayStream
    }
    // ... window/area/camera 分支
```

---

### 7. 录制引擎初始化 (App.tsx)

**文件**: `src/App.tsx` 第 264-309 行

```typescript
    if (!displayStream) {
      console.error('[ZapRec] No display stream available')
      await window.caplet.streamEnd()
      setStatus('idle')
      return
    }

    await recordingEngine.initialize(
      { width: recordingWidth, height: recordingHeight, fps: quality.fps },
      () => {}
    )

    recordingEngine.addVideoTrack(displayStream, recordingWidth, recordingHeight)

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

    if (currentSettings.autoHide) {
      window.caplet.windowMinimize()
    }
```

---

### 8. 停止录制 (App.tsx)

**文件**: `src/App.tsx` 第 321-351 行

```typescript
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

---

## 关键设计点

### 1. 简单直接
全屏录制是四种模式中最简单的，没有额外的窗口或选区数据需要管理。

### 2. 状态读取方式
使用 `useAppStore.getState()` 在 `startRecording` 内部读取最新状态，避免 `useCallback` 闭包陷阱。

### 3. 默认 fallback
如果 `selectedSourceId` 为 null，默认使用 `'screen:0:0'`（第一个屏幕）。

### 4. 自动隐藏
录制开始后，如果 `autoHide` 为 true，主窗口自动最小化。

### 5. 全屏取消清理
倒计时期间取消全屏录制，只需重置 `status` 和 `countdownValue`，无需额外清理（无 pending 数据）。
