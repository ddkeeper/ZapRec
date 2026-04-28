# 区域录制完整流程代码文档

## 概述

区域录制流程包含：区域选择 → 倒计时 → 录制开始 → 暂停/恢复 → 结束录制 → 裁剪处理。

---

## 1. 区域选择

### 1.1 Toolbar - 触发区域选择

**文件**: `src/components/Toolbar.tsx`

#### 1.1.1 源按钮点击处理 (行 116-123)
```typescript
const handleSourceClick = useCallback((source: RecordingSource) => {
  if (status !== 'idle') return

  if (source === 'area') {
    setSelectedSource(source)
    window.caplet.startAreaSelection()
    return
  }
  // ...
}, [status, setSelectedSource, ...])
```

#### 1.1.2 区域选择完成回调 (行 98-107)
```typescript
useEffect(() => {
  const unlisten = window.caplet.onAreaSelected((area) => {
    setPendingAreaSelection(area)
    setSelectedSource('area')
    startPreWarming()
    startCountdown()
  })
  return () => unlisten()
}, [setSelectedSource, setPendingAreaSelection, startCountdown, ...])
```

### 1.2 AreaOverlay 组件

**文件**: `src/components/AreaOverlay.tsx` (全文件 145 行)

#### 1.2.1 状态定义 (行 17-21)
```typescript
const [isSelecting, setIsSelecting] = useState(false)
const [selection, setSelection] = useState<AreaSelection | null>(null)
const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
const [isRecordingVisuals, setIsRecordingVisuals] = useState(false)
```

#### 1.2.2 鼠标事件处理 (行 30-56)
```typescript
const handleMouseDown = useCallback((e: React.MouseEvent) => {
  if (isRecordingVisuals) return
  setIsSelecting(true)
  setStartPoint({ x: e.clientX, y: e.clientY })
  setSelection(null)
}, [])

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
```

#### 1.2.3 录制视觉切换 (行 23-28)
```typescript
useEffect(() => {
  const unlisten = window.caplet.onSwitchToRecordingVisuals(() => {
    setIsRecordingVisuals(true)
  })
  return () => unlisten()
}, [])
```

### 1.3 主进程 - 创建区域选择窗口

**文件**: `src/main/index.ts`

#### 1.3.1 启动区域选择 (行 743-748)
```typescript
ipcMain.on('start-area-selection', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createSelectionWindow()
})
```

#### 1.3.2 创建选择窗口 (行 273-341)
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
    x, y, width, height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    movable: false,
    resizable: false,
    // ...
  })

  selectionWindow.setAlwaysOnTop(true, 'screen-saver')
  selectionWindow.loadURL(selectionUrl)

  if (process.platform === 'win32') {
    selectionWindow.hookWindowMessage(0x0084, (_e, result) => {
      result.writeInt32LE(1, 0)
      return true
    })
  }
}
```

#### 1.3.3 区域确认处理 (行 750-761)
```typescript
ipcMain.on('area-selected', (_, area) => {
  if (selectionWindow) {
    selectionWindow.setIgnoreMouseEvents(true)
    selectionWindow.webContents.send('switch-to-recording-visuals')
  }

  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('area-selected', area)
  }
})
```

#### 1.3.4 取消区域选择 (行 763-769)
```typescript
ipcMain.on('cancel-area-selection', () => {
  destroySelectionWindow()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('area-selection-cancelled')
  }
})
```

### 1.4 Preload IPC 接口

**文件**: `src/preload/index.ts`
```typescript
startAreaSelection: () => ipcRenderer.send('start-area-selection'),
cancelAreaSelection: () => ipcRenderer.send('cancel-area-selection'),
sendAreaSelected: (area) => ipcRenderer.send('area-selected', area),
onAreaSelected: (callback) => { ... },
onAreaSelectionCancelled: (callback) => { ... },
onSwitchToRecordingVisuals: (callback) => { ... },
```

---

## 2. 状态管理

### 2.1 区域相关状态

**文件**: `src/store/useAppStore.ts`

```typescript
// 类型定义 (行 11-18)
export interface ActiveCropArea {
  x: number
  y: number
  width: number
  height: number
  scaleX: number
  scaleY: number
}

// Store 字段 (行 60-62)
isSelectingArea: false,
pendingAreaSelection: null,
activeCropArea: null,

// Setter (行 84-85)
setPendingAreaSelection: (area) => set({ pendingAreaSelection: area }),
setActiveCropArea: (area) => set({ activeCropArea: area }),

// reset() 重置 (行 110-115)
reset: () => set({
  isSelectingArea: false,
  pendingAreaSelection: null,
  activeCropArea: null,
  // ...
})
```

---

## 3. 录制开始

**文件**: `src/App.tsx`

### 3.1 区域录制分支 (行 199-226)
```typescript
} else if (currentSource === 'area') {
  const pendingArea = state.pendingAreaSelection
  if (!pendingArea) {
    console.error('[ZapRec] Area mode but no pending area selection')
    recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
      await window.caplet.streamEnd()
    }).catch(console.error)
    setStatus('idle')
    return
  }

  // 捕获整个屏幕
  const rawStream = await mediaCapturer.startDisplayCapture('screen:0:0')
  displayStreamRef.current = rawStream
  displayStream = rawStream

  const videoSettings = rawStream.getVideoTracks()[0].getSettings()
  recordingWidth = videoSettings.width || window.screen.width
  recordingHeight = videoSettings.height || window.screen.height

  if (recordingWidth % 2 !== 0) recordingWidth--
  if (recordingHeight % 2 !== 0) recordingHeight--

  // 保存裁剪区域及缩放比例
  useAppStore.getState().setActiveCropArea({
    ...pendingArea,
    scaleX: recordingWidth / window.screen.width,
    scaleY: recordingHeight / window.screen.height
  })

  useAppStore.getState().setPendingAreaSelection(null)
}
```

---

## 4. 暂停/恢复

### 4.1 Toolbar 暂停按钮

**文件**: `src/components/Toolbar.tsx` (行 208-235)
```typescript
<button
  onClick={() => {
    const newPaused = !isPaused
    setIsPaused(newPaused)
    setStatus(newPaused ? 'paused' : 'recording')

    recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
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
    }).catch(console.error)
  }}
  // ...
>
  {isPaused ? <Play size={16} /> : <Pause size={16} />}
</button>
```

### 4.2 快捷键处理

**文件**: `src/App.tsx` (行 401-425)
```typescript
const unlistenPause = window.caplet.onShortcutTogglePause(() => {
  const store = useAppStore.getState()
  if (store.status !== 'recording' && store.status !== 'paused') return

  const newPaused = !store.isPaused
  store.setIsPaused(newPaused)
  setStatus(newPaused ? 'paused' : 'recording')

  recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
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
  }).catch(console.error)
})
```

---

## 5. 结束录制

**文件**: `src/App.tsx` (行 300-379)

```typescript
const stopRecording = useCallback(() => {
  const store = useAppStore.getState()
  const wasCameraMode = store.selectedSource === 'camera'
  const wasAreaMode = store.selectedSource === 'area'
  const savedPip = store.savedPipEnabled
  const cropArea = store.activeCropArea
  const currentSegments = [...store.recordingSegments]

  // 乐观 UI 更新
  if (timerRef.current) {
    clearInterval(timerRef.current)
    timerRef.current = null
  }
  store.reset()
  setStatus('idle')

  // 后台静默处理
  recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
    try {
      const lastSegmentPath = await recordingEngine.stopAndSave()
      await window.caplet.streamEnd()
      window.caplet.sendRecordingStopped()

      const allSegments = [...currentSegments, lastSegmentPath].filter(Boolean) as string[]
      const finalPath = recordingEngine.getBaseFilePath()

      // 清理媒体资源
      mediaCapturer.stopAll()
      // ... audio cleanup

      // 路由处理
      if (allSegments.length > 1 && finalPath) {
        // 多段：先拼接后裁剪
        window.caplet.processSegmentsConcat({ segments: allSegments, finalPath })
      } else if (allSegments.length === 1 && finalPath) {
        // 单段：直接重命名后裁剪
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
        }
      } else if (wasAreaMode && cropArea && lastSegmentPath) {
        // 无 finalPath 时的裁剪
        const finalW = Math.floor((cropArea.width * cropArea.scaleX) / 2) * 2
        const finalH = Math.floor((cropArea.height * cropArea.scaleY) / 2) * 2
        const finalX = Math.floor((cropArea.x * cropArea.scaleX) / 2) * 2
        const finalY = Math.floor((cropArea.y * cropArea.scaleY) / 2) * 2
        window.caplet.processAreaCrop({
          filePath: lastSegmentPath,
          cropParams: `${finalW}:${finalH}:${finalX}:${finalY}`
        })
      }

    } catch (error) {
      console.error('[ZapRec] Failed to stop recording silently:', error)
    }
  }).catch(console.error)
}, [setStatus, restorePipState])
```

---

## 6. 区域裁剪

### 6.1 主进程裁剪处理

**文件**: `src/main/index.ts` (行 781-811)
```typescript
ipcMain.on('process-area-crop', async (event, { filePath, cropParams }) => {
  const dir = path.dirname(filePath) || ''
  const ext = path.extname(filePath)
  const basename = path.basename(filePath, ext)
  const outputFilePath = path.join(dir, `${basename}_cropped${ext}`)

  try {
    ffmpeg(filePath)
      .videoFilters(`crop=${cropParams}`)
      .outputOptions([
        '-c:v libx264',
        '-preset veryfast',
        '-crf 17',
        '-pix_fmt yuv420p',
        '-c:a copy'
      ])
      .save(outputFilePath)
      .on('end', () => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
        event.reply('crop-finished', outputFilePath)
      })
      .on('error', (err) => {
        event.reply('crop-failed', err.message)
      })
  } catch (err) {
    console.error('[ZapRec] FFmpeg execution error:', err)
  }
})
```

### 6.2 Preload 裁剪接口

**文件**: `src/preload/index.ts`
```typescript
processAreaCrop: (params) => ipcRenderer.send('process-area-crop', params),
onCropFinished: (callback) => { ... },
onCropFailed: (callback) => { ... },
```

### 6.3 App 裁剪回调

**文件**: `src/App.tsx` (行 434-438)
```typescript
const unlistenCropFinished = window.caplet.onCropFinished((filePath) => {
  console.log('[ZapRec] Crop finished:', filePath)
  setStatus('idle')
})

const unlistenCropFailed = window.caplet.onCropFailed((error) => {
  console.error('[ZapRec] Crop failed:', error)
  setStatus('idle')
})
```

---

## 7. 流程图

```
区域选择
  ├─ Toolbar: handleSourceClick('area')
  │   └─ setSelectedSource('area')
  │   └─ window.caplet.startAreaSelection()
  │
  ├─ 主进程: 创建全屏透明窗口
  │
  ├─ AreaOverlay: 用户拖拽选区
  │   ├─ Enter → window.caplet.sendAreaSelected(area)
  │   └─ Esc → window.caplet.cancelAreaSelection()
  │
  └─ Toolbar: onAreaSelected 回调
      ├─ setPendingAreaSelection(area)
      ├─ startPreWarming()
      └─ startCountdown()
         ↓
录制开始
  ├─ App: startRecording()
  │   ├─ mediaCapturer.startDisplayCapture('screen:0:0')
  │   ├─ setActiveCropArea({ ...pendingArea, scaleX, scaleY })
  │   ├─ recordingEngine.addVideoTrack()
  │   └─ setStatus('recording')
  │
  └─ 录制中遮罩: AreaOverlay 显示录制区域
     ↓
暂停/恢复 (与全屏模式相同)
  ├─ recordingEngine.pause() → 保存分段
  └─ recordingEngine.resume() → 继续录制
     ↓
结束录制
  ├─ store.reset() → 乐观 UI 更新
  │
  ├─ 后台处理
  │   ├─ recordingEngine.stopAndSave()
  │   ├─ window.caplet.streamEnd()
  │   └─ window.caplet.sendRecordingStopped()
  │
  └─ 路由处理
      ├─ 多段 → FFmpeg concat → FFmpeg crop
      ├─ 单段 → renameFile → FFmpeg crop
      └─ crop-finished → setStatus('idle')
```

---

## 8. 相关文件

| 文件 | 职责 |
|------|------|
| `src/components/AreaOverlay.tsx` | 区域选择 UI、拖拽交互 |
| `src/components/Toolbar.tsx` | 区域按钮、暂停/恢复按钮 |
| `src/App.tsx` | 录制逻辑、裁剪路由 |
| `src/store/useAppStore.ts` | pendingAreaSelection、activeCropArea |
| `src/main/index.ts` | 选择窗口创建、FFmpeg 裁剪 |
| `src/preload/index.ts` | IPC 接口暴露 |