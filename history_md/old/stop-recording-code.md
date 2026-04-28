# 结束录制功能代码文档

## 概述

结束录制涉及多层级联动：UI 按钮 → 全局状态管理 → 底层引擎 → 主进程 IPC → 文件系统。

**区域录制特殊流程**：区域模式停止时，会触发 FFmpeg 裁剪处理。

---

## 触发途径

### 1. 点击停止按钮 (Toolbar)

**文件**: `src/components/Toolbar.tsx`

```typescript
// 第 153-157 行
const handleRecordToggle = useCallback(() => {
  if (isRecording) {
    onStopRecording()  // 调用 App.tsx 传入的 stopRecording
  }
}, [isRecording, onStopRecording])

// 第 225-231 行 - 停止按钮 UI
<button
  onClick={handleRecordToggle}
  className="p-2 rounded-md hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-colors"
  title="停止录制"
>
  <Square size={16} strokeWidth={2} fill="currentColor" />
</button>
```

**触发条件**: `isRecording === true`（status === 'recording' 或 'paused'）

---

### 2. 快捷键触发

**文件**: `src/App.tsx`

```typescript
// 第 471-475 行 - 录制快捷键（切换录制/停止）
const unlistenRecord = window.caplet.onShortcutToggleRecord(() => {
  const s = useAppStore.getState().status
  if (s === 'recording') stopRecording()
  else if (s === 'idle') startRecording()
})

// 第 491-496 行 - 外部停止请求
const unlistenRecordingStopRequested = window.caplet.onRecordingStopRequested(() => {
  const s = useAppStore.getState().status
  if (s === 'recording' || s === 'paused') {
    stopRecording()
  }
})
```

---

## 核心停止逻辑

### stopRecording 函数 (App.tsx)

**文件**: `src/App.tsx`

```typescript
const stopRecording = useCallback(async () => {
  try {
    const store = useAppStore.getState()
    const wasCameraMode = store.selectedSource === 'camera'
    const wasAreaMode = store.selectedSource === 'area'
    const savedPip = store.savedPipEnabled
    const cropArea = store.activeCropArea

    // 1. 清除计时器
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // 2. 重置全局状态
    store.reset()
    setStatus('idle')

    // 3. 关闭摄像头预览窗口（如需要）
    if (wasCameraMode) {
      window.caplet.closeCameraPreviewWindow()
    }

    // 4. 停止媒体捕获
    mediaCapturer.stopAll()

    // 5. 停止媒体轨道
    if (systemAudioStreamRef.current) {
      systemAudioStreamRef.current.getTracks().forEach(track => track.stop())
      systemAudioStreamRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop())
      micStreamRef.current = null
    }

    // 6. 销毁音频混音器
    audioMixer.destroy()
    displayStreamRef.current = null

    // 7. 恢复 PIP 状态（如需要）
    if (wasCameraMode && savedPip) {
      restorePipState()
    }

    // 8. 后台处理：停止引擎 + FFmpeg 裁剪（area 模式）
    ;(async () => {
      try {
        const filePath = await recordingEngine.stopAndSave()
        await window.caplet.streamEnd()
        window.caplet.sendRecordingStopped()

        if (wasAreaMode && cropArea && filePath) {
          // 计算 FFmpeg crop 参数（物理像素坐标，必须偶数）
          const finalW = Math.floor((cropArea.width * cropArea.scaleX) / 2) * 2
          const finalH = Math.floor((cropArea.height * cropArea.scaleY) / 2) * 2
          const finalX = Math.floor((cropArea.x * cropArea.scaleX) / 2) * 2
          const finalY = Math.floor((cropArea.y * cropArea.scaleY) / 2) * 2

          // 触发 FFmpeg 裁剪
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

## 底层引擎停止

### RecordingEngine.stopAndSave()

**文件**: `src/core/RecordingEngine.ts`

```typescript
private currentFilePath: string | null = null

setFilePath(path: string): void {
  this.currentFilePath = path
}

async stopAndSave(): Promise<string | null> {
  this.isRecording = false
  console.log('[RecordingEngine] Stopping and saving...')

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

  // 清理所有引用
  this.streamTarget = null
  this.writableStream = null
  this.videoSource = null
  this.audioSource = null
  this.videoTrack = null
  this.audioTracks = []
  this.isPaused = false

  const filePath = this.currentFilePath
  this.currentFilePath = null
  return filePath
}
```

---

## IPC 通信

### 主进程通知 (通过 preload)

| IPC 方法 | 方向 | 作用 |
|----------|------|------|
| `streamEnd()` | Renderer → Main | 通知主进程结束写入流 |
| `sendRecordingStopped()` | Renderer → Main | 通知主进程录制已停止 |
| `processAreaCrop()` | Renderer → Main | 触发 FFmpeg 裁剪（area 模式） |
| `crop-finished` | Main → Renderer | FFmpeg 裁剪完成 |
| `crop-failed` | Main → Renderer | FFmpeg 裁剪失败 |

### FFmpeg 裁剪监听

```typescript
const unlistenCropFinished = window.caplet.onCropFinished((filePath) => {
  console.log('[ZapRec] Crop finished, opening file:', filePath)
  setStatus('idle')
  window.caplet.showItemInFolder(filePath)
})

const unlistenCropFailed = window.caplet.onCropFailed((error) => {
  console.error('[ZapRec] Crop failed:', error)
  setStatus('idle')
})
```

---

## 完整时序图

### 普通模式（display/window/camera）

```
用户点击停止按钮 / 快捷键触发
    ↓
App.tsx: stopRecording()
    ├─ clearInterval(timerRef)
    ├─ store.reset()
    ├─ mediaCapturer.stopAll()
    ├─ track.stop() (systemAudio, mic)
    ├─ audioMixer.destroy()
    ├─ useAppStore.getState().reset()
    ├─ setStatus('idle')
    ├─ restorePipState() (camera mode only)
    ├─ closeCameraPreviewWindow() (camera mode only)
    ├─ recordingEngine.stopAndSave()
    ├─ window.caplet.streamEnd()
    └─ sendRecordingStopped()
    ↓
主进程写入文件完成
```

### 区域模式（area）

```
用户点击停止按钮 / 快捷键触发
    ↓
App.tsx: stopRecording()
    ├─ ... 前置清理同上 ...
    ├─ recordingEngine.stopAndSave()
    ├─ window.caplet.streamEnd()
    └─ window.caplet.processAreaCrop()  ← 触发 FFmpeg
    ↓
主进程 FFmpeg 执行 crop 滤镜
    ├─ 删除原始全屏文件
    └─ event.reply('crop-finished', croppedFilePath)
    ↓
App.tsx: onCropFinished()
    ├─ setStatus('idle')
    └─ showItemInFolder(croppedFilePath)
```

---

## 相关文件列表

| 文件 | 职责 |
|------|------|
| `src/components/Toolbar.tsx` | 停止按钮 UI + `handleRecordToggle` |
| `src/App.tsx` | `stopRecording()` 主逻辑 + FFmpeg 触发 |
| `src/core/RecordingEngine.ts` | `stopAndSave()` 方法 |
| `src/core/AudioMixer.ts` | `destroy()` 销毁混音器 |
| `src/core/MediaCapturer.ts` | `stopAll()` 停止所有捕获 |
| `src/store/useAppStore.ts` | `reset()` 重置全局状态 + `activeCropArea` |
| `src/main/index.ts` | FFmpeg `process-area-crop` IPC 处理 |
| `src/preload/index.ts` | `processAreaCrop` API 暴露 |
