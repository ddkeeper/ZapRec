# 全屏模式录制/结束录制代码文档

## 概述

本文档整理全屏 (Display) 模式下录制开始和结束的相关代码逻辑。

---

## 1. 录制开始流程

### 1.1 Toolbar - 录制源选择 (触发入口)

**文件**: `src/components/Toolbar.tsx` (行 116-152)

```typescript
const handleSourceClick = useCallback((source: RecordingSource) => {
  if (status !== 'idle') return

  // display 模式：直接设置源 + 倒计时 + 预热
  setSelectedSource(source)
  startPreWarming()
  startCountdown()
}, [status, setSelectedSource, startCountdown, onStartRecording])
```

**全屏按钮渲染** (行 289-312):
```typescript
{/* 录制源按钮 */}
(['display', 'window', 'area', 'camera'] as const).map((source) => {
  const IconComponent = sourceIcons[source]
  const titles: Record<RecordingSource, string> = {
    display: '录制整个屏幕',
    window: '录制指定窗口',
    area: '录制屏幕区域',
    camera: '仅录制摄像头'
  }
  return (
    <button
      key={source}
      onClick={() => handleSourceClick(source)}
      className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-all hover:bg-white/10"
      title={titles[source]}
    >
      <IconComponent size={18} strokeWidth={2} color="rgba(255,255,255,0.9)" />
      <span className="text-xs mt-0.5 text-white/90 font-medium">
        {sourceLabels[source]}
      </span>
    </button>
  )
})
```

### 1.2 App.tsx - startRecording 核心逻辑

**文件**: `src/App.tsx` (行 100-298)

#### 1.2.1 路径初始化 (行 110-116)
```typescript
const quality = QUALITY_PRESETS[currentSettings.quality]
const outputDir = currentSettings.outputDirectory || defaultPath || ''
const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
const filepath = `${outputDir}/ZapRec_${timestamp}.mp4`

const part1Path = recordingEngine.initializePaths(filepath)
await window.caplet.streamStart(part1Path)
```

#### 1.2.2 全屏捕获分支 (行 122-125)
```typescript
if (currentSource === 'display') {
  const sourceId = currentSourceId || 'screen:0:0'
  displayStream = await mediaCapturer.startDisplayCapture(sourceId)
  displayStreamRef.current = displayStream
}
```

#### 1.2.3 音频混流初始化 (行 242-269)
```typescript
await audioMixer.initialize()

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

const micStream = await mediaCapturer.startMicrophoneCapture()
micStreamRef.current = micStream
const isMicAdded = audioMixer.addStream(micStream, 'microphone')
if (isMicAdded) {
  audioMixer.setGain('microphone', microphoneEnabled ? 1 : 0)
}

await audioMixer.resume()
```

#### 1.2.4 添加音视频轨道并启动 (行 235-276)
```typescript
await recordingEngine.initialize(
  { width: recordingWidth, height: recordingHeight, fps: quality.fps },
  () => {}
)

recordingEngine.addVideoTrack(displayStream, recordingWidth, recordingHeight)

const mixedStream = audioMixer.getOutputStream()
if (mixedStream && mixedStream.getAudioTracks().length > 0) {
  recordingEngine.addAudioTrack(mixedStream)
}

await recordingEngine.start()
setLastSavedPath(filepath)
setStatus('recording')

if (currentSettings.autoHide) {
  window.caplet.windowMinimize()
}
```

---

## 2. 结束录制流程

### 2.1 Toolbar - 停止按钮触发

**文件**: `src/components/Toolbar.tsx` (行 154-158)

```typescript
const handleRecordToggle = useCallback(() => {
  if (isRecording || isPaused) {
    onStopRecording()
  }
}, [isRecording, isPaused, onStopRecording])
```

**停止按钮** (行 235-241):
```typescript
<button
  onClick={handleRecordToggle}
  className="p-2 rounded-md hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-colors"
  title="停止录制"
>
  <Square size={16} strokeWidth={2} fill="currentColor" />
</button>
```

### 2.2 App.tsx - stopRecording 核心逻辑

**文件**: `src/App.tsx` (行 300-379)

#### 2.2.1 保存最后一段并清理资源 (行 300-337)
```typescript
const stopRecording = useCallback(() => {
  recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
    try {
      const store = useAppStore.getState()
      const wasCameraMode = store.selectedSource === 'camera'
      const wasAreaMode = store.selectedSource === 'area'
      const savedPip = store.savedPipEnabled
      const cropArea = store.activeCropArea

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      const lastSegmentPath = await recordingEngine.stopAndSave()
      await window.caplet.streamEnd()
      window.caplet.sendRecordingStopped()

      const allSegments = [...store.recordingSegments, lastSegmentPath].filter(Boolean) as string[]
      const finalPath = recordingEngine.getBaseFilePath()

      store.reset()
      setStatus('idle')

      if (wasCameraMode) {
        window.caplet.closeCameraPreviewWindow()
      }

      mediaCapturer.stopAll()
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
    }
  }).catch(console.error)
}, [setStatus, restorePipState])
```

#### 2.2.2 路由处理 (拼接/裁剪/打开文件夹) (行 343-372)
```typescript
if (allSegments.length > 1 && finalPath) {
  setStatus('processing')
  window.caplet.processSegmentsConcat({ segments: allSegments, finalPath })
} else if (allSegments.length === 1 && finalPath) {
  window.caplet.renameFile(allSegments[0], finalPath)
  if (wasAreaMode && cropArea) {
    const finalW = Math.floor((cropArea.width * cropArea.scaleX) / 2) * 2
    const finalH = Math.floor((cropArea.height * cropArea.scaleY) / 2) * 2
    const finalX = Math.floor((cropArea.x * cropArea.scaleX) / 2) * 2
    const finalY = Math.floor((cropArea.y * cropArea.scaleY) / 2) * 2
    window.caplet.processAreaCrop({
      filePath: finalPath,
      cropParams: `${finalW}:${finalH}:${finalX}:${finalY}`
    })
    setStatus('processing')
  } else {
    window.caplet.showItemInFolder(finalPath)
  }
} else if (wasAreaMode && cropArea && lastSegmentPath) {
  // 单段区域录制的裁剪处理
  window.caplet.processAreaCrop({
    filePath: lastSegmentPath,
    cropParams: `${finalW}:${finalH}:${finalX}:${finalY}`
  })
  setStatus('processing')
}
```

---

## 3. 快捷键处理

**文件**: `src/App.tsx` (行 395-398)

```typescript
const unlistenRecord = window.caplet.onShortcutToggleRecord(() => {
  const s = useAppStore.getState().status
  if (s === 'recording' || s === 'paused') stopRecording()
  else if (s === 'idle') startRecording()
})
```

- **Ctrl+Shift+R**: 录制中/暂停中 → 停止录制；空闲状态 → 开始录制

---

## 4. 全局状态管理

**文件**: `src/store/useAppStore.ts`

### 4.1 核心状态
```typescript
status: 'idle'          // 当前录制状态
selectedSource: 'display' // 当前选中的录制源
isPaused: false          // 是否暂停
recordingSegments: []     // 录制的分段列表
```

### 4.2 reset() 方法 (停止后重置)
```typescript
reset: () => set({
  isSelectingArea: false,
  pendingAreaSelection: null,
  activeCropArea: null,
  selectedWindow: null,
  pendingCameraSettings: null,
  pipButtonDisabled: false,
  savedPipEnabled: null,
  status: 'idle',
  selectedSource: 'display',
  selectedSourceId: null,
  countdownValue: 0,
  recordingDuration: 0,
  prepState: 'idle',
  isCountdownFinished: false,
  isPaused: false,
  recordingSegments: []
})
```

---

## 5. 流程图

```
开始录制
  ├─ Toolbar: handleSourceClick('display')
  │   └─ setSelectedSource('display')
  │   └─ startPreWarming()
  │   └─ startCountdown()
  │
  ├─ App: startRecording()
  │   ├─ recordingEngine.initializePaths(filepath)
  │   ├─ window.caplet.streamStart(part1Path)
  │   ├─ mediaCapturer.startDisplayCapture('screen:0:0')
  │   ├─ audioMixer.initialize()
  │   ├─ audioMixer.addStream(systemStream, 'system')
  │   ├─ audioMixer.addStream(micStream, 'microphone')
  │   ├─ recordingEngine.addVideoTrack(displayStream)
  │   ├─ recordingEngine.addAudioTrack(mixedStream)
  │   ├─ recordingEngine.start()
  │   └─ setStatus('recording')
  │
  └─ Toolbar 显示: 计时器 + 暂停/恢复 + 停止 按钮

停止录制
  ├─ Toolbar: handleRecordToggle() → onStopRecording()
  │   或 快捷键 Ctrl+Shift+R
  │
  ├─ App: stopRecording()
  │   ├─ recordingEngine.stopAndSave()
  │   ├─ window.caplet.streamEnd()
  │   ├─ window.caplet.sendRecordingStopped()
  │   ├─ mediaCapturer.stopAll()
  │   ├─ audioMixer.destroy()
  │   ├─ store.reset()
  │   └─ 路由处理
  │       ├─ 多段 → processSegmentsConcat() → FFmpeg concat
  │       ├─ 单段 + 区域 → processAreaCrop()
  │       └─ 单段 → renameFile() → showItemInFolder()
  │
  └─ Toolbar 显示: 录制源按钮
```

---

## 6. 相关文件

| 文件 | 职责 |
|------|------|
| `src/components/Toolbar.tsx` | 录制源按钮、停止按钮 UI |
| `src/App.tsx` | startRecording/stopRecording 核心逻辑、快捷键 |
| `src/store/useAppStore.ts` | 全局状态管理 |
| `src/core/RecordingEngine.ts` | 录制引擎、音视频轨道管理 |
| `src/core/MediaCapturer.ts` | 屏幕/窗口/摄像头捕获 |
| `src/core/AudioMixer.ts` | 音频混流 |
| `src/main/index.ts` | 主进程 IPC 处理 |