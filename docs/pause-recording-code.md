# 暂停录制功能代码文档

## 概述

基于**分段录制 + FFmpeg 无缝拼接**架构。

---

## 代码位置

### 1. RecordingEngine - 核心逻辑

**文件**: `src/core/RecordingEngine.ts`

#### 完整代码

```typescript
import {
  Output,
  Mp4OutputFormat,
  StreamTarget,
  MediaStreamVideoTrackSource,
  MediaStreamAudioTrackSource,
  QUALITY_VERY_HIGH,
  type StreamTargetChunk
} from 'mediabunny'

export interface RecordingConfig {
  width: number
  height: number
  fps: number
}

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

export class RecordingEngine {
  private output: Output | null = null
  private streamTarget: StreamTarget | null = null
  private writableStream: IPCWritableStream | null = null
  private videoSource: MediaStreamVideoTrackSource | null = null
  private audioSource: MediaStreamAudioTrackSource | null = null
  private audioTracks: MediaStreamTrack[] = []
  private isRecording = false
  private isPaused = false
  private currentFilePath: string | null = null
  private baseFilePath: string | null = null
  private segmentIndex = 0
  private _config: RecordingConfig | null = null
  private rawVideoTrack: MediaStreamTrack | null = null
  private rawAudioTrack: MediaStreamTrack | null = null
  private clonedVideoTrack: MediaStreamTrack | null = null

  async initialize(
    config: RecordingConfig,
    _onData: (chunk: Uint8Array) => void
  ): Promise<boolean> {
    try {
      this._config = config
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

  // 初始化基础路径，返回第一段路径
  initializePaths(basePath: string): string {
    this.baseFilePath = basePath
    this.segmentIndex = 1
    const part1Path = this.generateSegmentPath(this.segmentIndex)
    this.currentFilePath = part1Path
    return part1Path!
  }

  setFilePath(path: string): void {
    this.currentFilePath = path
  }

  getCurrentFilePath(): string | null {
    return this.currentFilePath
  }

  getBaseFilePath(): string | null {
    return this.baseFilePath
  }

  // 生成指定索引的分段路径
  generateSegmentPath(index: number): string | null {
    if (!this.baseFilePath) return null

    const lastSlashIndex = Math.max(
      this.baseFilePath.lastIndexOf('/'),
      this.baseFilePath.lastIndexOf('\\')
    )
    const nameWithExt = lastSlashIndex !== -1
      ? this.baseFilePath.substring(lastSlashIndex + 1)
      : this.baseFilePath

    const dotIndex = nameWithExt.lastIndexOf('.')
    const basename = dotIndex !== -1 ? nameWithExt.substring(0, dotIndex) : nameWithExt
    const ext = dotIndex !== -1 ? nameWithExt.substring(dotIndex) : ''

    if (lastSlashIndex !== -1) {
      const dir = this.baseFilePath.substring(0, lastSlashIndex)
      return `${dir}/${basename}_part${index}${ext}`
    }
    return `${basename}_part${index}${ext}`
  }

  // 生成下一段路径并递增索引
  generateNextSegmentPath(): string | null {
    this.segmentIndex++
    return this.generateSegmentPath(this.segmentIndex)
  }

  // 添加视频轨道，缓存原始轨道
  addVideoTrack(stream: MediaStream, width?: number, height?: number): boolean {
    if (!this.output) return false

    try {
      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) {
        console.error('No video track found')
        return false
      }

      this.rawVideoTrack = videoTrack

      this.videoSource = new MediaStreamVideoTrackSource(videoTrack, {
        codec: 'avc',
        bitrate: QUALITY_VERY_HIGH,
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

  // 添加音频轨道，缓存原始轨道
  addAudioTrack(stream: MediaStream): boolean {
    if (!this.output) return false

    try {
      const audioTrack = stream.getAudioTracks()[0]
      if (!audioTrack) {
        console.log('No audio track found')
        return false
      }

      this.rawAudioTrack = audioTrack
      this.audioTracks.push(audioTrack)

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

  async start(): Promise<void> {
    if (!this.output) return

    try {
      await this.output.start()
      this.isRecording = true
      this.isPaused = false
      console.log('[RecordingEngine] Recording started')
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }

  // 停止并保存，返回当前段路径
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

    this.streamTarget = null
    this.writableStream = null
    this.videoSource = null
    this.audioSource = null
    this.audioTracks = []

    const filePath = this.currentFilePath
    this.currentFilePath = null
    return filePath
  }

  async stop(): Promise<void> {
    this.isRecording = false
    console.log('[RecordingEngine] Stopping recording...')

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
    this.audioTracks = []
  }

  getIsRecording(): boolean {
    return this.isRecording
  }

  // 暂停：停止克隆轨道，保存当前段
  async pause(): Promise<string | null> {
    if (!this.isRecording || this.isPaused) return null

    // 停止克隆的视频轨道，防止摄像头多个活动轨道
    if (this.clonedVideoTrack) {
      try {
        this.clonedVideoTrack.stop()
        console.log('[RecordingEngine] Stopped cloned video track before pause')
      } catch (e) {}
      this.clonedVideoTrack = null
    }

    const segmentPath = await this.stopAndSave()
    this.isPaused = true
    console.log('[RecordingEngine] Paused: segment saved', segmentPath)
    return segmentPath
  }

  // 恢复：创建新克隆轨道，重新创建 Source
  async resume(): Promise<void> {
    if (!this.isPaused) return

    if (!this._config) {
      console.error('[RecordingEngine] Cannot resume: no config stored')
      return
    }

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

      if (this.rawVideoTrack) {
        if (this.clonedVideoTrack) {
          try { this.clonedVideoTrack.stop() } catch (e) {}
        }
        this.clonedVideoTrack = this.rawVideoTrack.clone()
        this.videoSource = new MediaStreamVideoTrackSource(
          this.clonedVideoTrack as any,
          { codec: 'avc', bitrate: QUALITY_VERY_HIGH }
        )
        this.output.addVideoTrack(this.videoSource)
      }

      if (this.rawAudioTrack) {
        this.audioSource = new MediaStreamAudioTrackSource(
          this.rawAudioTrack as any,
          { codec: 'aac', bitrate: 128000 }
        )
        this.output.addAudioTrack(this.audioSource)
      }

      await this.output.start()
      this.isRecording = true
      this.isPaused = false
      console.log('[RecordingEngine] Resumed: new segment started')
    } catch (error) {
      console.error('[RecordingEngine] Failed to resume:', error)
    }
  }

  getIsPaused(): boolean {
    return this.isPaused
  }

  getSegmentIndex(): number {
    return this.segmentIndex
  }
}

export const recordingEngine = new RecordingEngine()
```

---

### 2. Toolbar - 暂停/恢复按钮

**文件**: `src/components/Toolbar.tsx`

#### 暂停/恢复按钮处理逻辑 (行 208-233)

```typescript
{/* 暂停/恢复 */}
<button
  onClick={async () => {
    const newPaused = !isPaused
    setIsPaused(newPaused)
    setStatus(newPaused ? 'paused' : 'recording')

    if (newPaused) {
      const segmentPath = await recordingEngine.pause()
      await window.caplet.streamEnd()
      if (segmentPath) {
        useAppStore.getState().addRecordingSegment(segmentPath)
      }
    } else {
      const nextSegmentPath = recordingEngine.generateNextSegmentPath()
      if (nextSegmentPath) {
        recordingEngine.setFilePath(nextSegmentPath)
        await window.caplet.streamStart(nextSegmentPath)
      }
      await recordingEngine.resume()
    }
  }}
  className="p-2 rounded-md hover:bg-white/10 text-white/90 transition-colors"
  title={isPaused ? "恢复" : "暂停"}
>
  {isPaused ? <Play size={16} strokeWidth={2} /> : <Pause size={16} strokeWidth={2} />}
</button>
```

#### 停止按钮处理逻辑 (行 235-241)

```typescript
{/* 停止 */}
<button
  onClick={handleRecordToggle}
  className="p-2 rounded-md hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-colors"
  title="停止录制"
>
  <Square size={16} strokeWidth={2} fill="currentColor" />
</button>
```

#### handleRecordToggle 定义 (行 154-158)

```typescript
const handleRecordToggle = useCallback(() => {
  if (isRecording || isPaused) {
    onStopRecording()
  }
}, [isRecording, isPaused, onStopRecording])
```

---

### 3. App.tsx - 停止处理

**文件**: `src/App.tsx`

#### stopRecording 函数 (行 300-379)

```typescript
const stopRecording = useCallback(async () => {
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

    if (wasCameraMode && savedPip) {
      restorePipState()
    }

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
      const finalW = Math.floor((cropArea.width * cropArea.scaleX) / 2) * 2
      const finalH = Math.floor((cropArea.height * cropArea.scaleY) / 2) * 2
      const finalX = Math.floor((cropArea.x * cropArea.scaleX) / 2) * 2
      const finalY = Math.floor((cropArea.y * cropArea.scaleY) / 2) * 2
      window.caplet.processAreaCrop({
        filePath: lastSegmentPath,
        cropParams: `${finalW}:${finalH}:${finalX}:${finalY}`
      })
      setStatus('processing')
    }

  } catch (error) {
    console.error('[ZapRec] Failed to stop recording:', error)
    useAppStore.getState().reset()
    setStatus('idle')
  }
}, [setStatus, restorePipState])
```

#### 暂停/恢复快捷键处理 (行 399-421)

```typescript
const unlistenPause = window.caplet.onShortcutTogglePause(async () => {
  const store = useAppStore.getState()
  if (store.status !== 'recording' && store.status !== 'paused') return

  const newPaused = !store.isPaused
  store.setIsPaused(newPaused)
  setStatus(newPaused ? 'paused' : 'recording')

  if (newPaused) {
    const segmentPath = await recordingEngine.pause()
    await window.caplet.streamEnd()
    if (segmentPath) {
      store.addRecordingSegment(segmentPath)
    }
  } else {
    const nextSegmentPath = recordingEngine.generateNextSegmentPath()
    if (nextSegmentPath) {
      recordingEngine.setFilePath(nextSegmentPath)
      await window.caplet.streamStart(nextSegmentPath)
    }
    await recordingEngine.resume()
  }
})
```

#### 停止请求处理 (行 423-428)

```typescript
const unlistenRecordingStopRequested = window.caplet.onRecordingStopRequested(() => {
  const s = useAppStore.getState().status
  if (s === 'recording' || s === 'paused') {
    stopRecording()
  }
})
```

#### 录制开始 (行 76-78)

```typescript
const part1Path = recordingEngine.initializePaths(filepath)
await window.caplet.streamStart(part1Path)
await recordingEngine.start()
```

---

### 4. 主进程 IPC

**文件**: `src/main/index.ts`

#### 文件流管理

```typescript
// stream-start (行 192)
ipcMain.handle('stream-start', async (_, filepath: string) => {
  const dir = path.dirname(filepath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  writeStream = fs.createWriteStream(filepath)
  return { success: true }
})

// stream-write (行 207)
ipcMain.handle('stream-write', async (_, chunk: Uint8Array) => {
  if (writeStream) {
    writeStream.write(Buffer.from(chunk))
    return { success: true }
  }
  return { success: false, error: 'No active stream' }
})

// stream-end (行 217)
ipcMain.handle('stream-end', async () => {
  return new Promise((resolve) => {
    if (writeStream) {
      writeStream.end(() => {
        writeStream = null
        resolve({ success: true })
      })
    } else {
      resolve({ success: false, error: 'No active stream' })
    }
  })
})

// recording-stopped (行 771) - 销毁 selection window
ipcMain.on('recording-stopped', () => {
  destroySelectionWindow()
})

// rename-file (行 241)
ipcMain.on('rename-file', (_, { oldPath, newPath }) => {
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath)
  }
})
```

#### FFmpeg 拼接 (行 850)

```typescript
ipcMain.on('process-segments-concat', async (event, { segments, finalPath }) => {
  if (!segments || segments.length === 0) {
    event.reply('concat-finished', null)
    return
  }

  const dir = path.dirname(finalPath)
  const listFilePath = path.join(dir, `concat_list_${Date.now()}.txt`)

  const fileContent = segments
    .map((p: string) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')

  fs.writeFileSync(listFilePath, fileContent)

  ffmpeg()
    .input(listFilePath)
    .inputOptions(['-f concat', '-safe 0'])
    .outputOptions(['-c copy'])
    .save(finalPath)
    .on('end', () => {
      segments.forEach((p: string) => { if (fs.existsSync(p)) fs.unlinkSync(p) })
      if (fs.existsSync(listFilePath)) fs.unlinkSync(listFilePath)
      event.reply('concat-finished', finalPath)
    })
    .on('error', (err: Error) => {
      event.reply('concat-failed', err.message)
    })
})
```

---

### 5. 预加载接口

**文件**: `src/preload/index.ts`

```typescript
// 行 153-165
processSegmentsConcat: (params: { segments: string[], finalPath: string }) =>
  ipcRenderer.send('process-segments-concat', params),

onConcatFinished: (callback: (filePath: string | null) => void) => {
  const handler = (_: unknown, filePath: string | null) => callback(filePath)
  ipcRenderer.on('concat-finished', handler)
  return () => ipcRenderer.removeListener('concat-finished', handler)
},

onConcatFailed: (callback: (error: string) => void) => {
  const handler = (_: unknown, error: string) => callback(error)
  ipcRenderer.on('concat-failed', handler)
  return () => ipcRenderer.removeListener('concat-failed', handler)
},

renameFile: (oldPath: string, newPath: string) =>
  ipcRenderer.send('rename-file', { oldPath, newPath })
```

---

### 6. 全局状态

**文件**: `src/store/useAppStore.ts`

```typescript
recordingSegments: [],
addRecordingSegment: (path) => set((state) => ({
  recordingSegments: [...state.recordingSegments, path]
})),
clearRecordingSegments: () => set({ recordingSegments: [] }),
```

---

## 流程图

```
录制开始 (commitRecording)
  ├─ recordingEngine.initializePaths(filepath)
  ├─ window.caplet.streamStart(part1Path)
  └─ recordingEngine.start()
     ↓
暂停 (Toolbar 暂停按钮 或 快捷键)
  ├─ recordingEngine.pause()
  │   ├─ clonedVideoTrack.stop() ← 停止克隆轨道
  │   └─ stopAndSave() → 返回当前段路径
  ├─ window.caplet.streamEnd()
  └─ store.addRecordingSegment(segmentPath)
     ↓
恢复 (Toolbar 恢复按钮 或 快捷键)
  ├─ recordingEngine.generateNextSegmentPath()
  ├─ recordingEngine.setFilePath(nextPath)
  ├─ window.caplet.streamStart(nextPath)
  └─ recordingEngine.resume()
      └─ rawVideoTrack.clone() → 创建新克隆轨道
     ↓
停止 (Toolbar 停止按钮 或 快捷键)
  ├─ recordingEngine.stopAndSave()
  ├─ window.caplet.streamEnd()
  ├─ window.caplet.sendRecordingStopped() ← 销毁 selection window
  ├─ mediaCapturer.stopAll()
  └─ 路由处理
      ├─ 多段 → processSegmentsConcat() → FFmpeg concat
      ├─ 单段 + 区域 → processAreaCrop()
      └─ 单段 → renameFile() → showItemInFolder()
```

---

## 相关文件

| 文件 | 职责 |
|------|------|
| `src/core/RecordingEngine.ts` | 核心录制逻辑，暂停/恢复/停止 |
| `src/components/Toolbar.tsx` | 暂停/恢复/停止按钮 UI |
| `src/App.tsx` | 应用调度，stopRecording 函数 |
| `src/main/index.ts` | IPC 处理 |
| `src/preload/index.ts` | IPC 暴露 |
| `src/store/useAppStore.ts` | 状态管理 |