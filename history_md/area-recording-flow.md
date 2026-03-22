# 区域录制流程代码整理

## 完整流程图

```
用户点击"区域"按钮
      │
      ▼
Toolbar.handleSourceClick('area')
  ├─ setSelectedSource('area')
  └─ window.caplet.startAreaSelection()
      │
      ▼
主进程: 'start-area-selection' IPC
  ├─ mainWindow.hide()
  └─ createSelectionWindow() → 选区窗口
      │
      ▼
用户拖拽选择区域 → 按 Enter 确认
      │
      ▼
AreaOverlay.onConfirm(area) → window.caplet.sendAreaSelected(area)
      │
      ▼
主进程: 'area-selected' IPC
  ├─ selectionWindow.setIgnoreMouseEvents(true) ← 鼠标穿透
  ├─ selectionWindow.webContents.send('switch-to-recording-visuals')
  │     → AreaOverlay 显示幽灵幕布
  ├─ mainWindow.show()
  └─ mainWindow.webContents.send('area-selected', area)
      │
      ▼
Toolbar: window.caplet.onAreaSelected(area)
  ├─ setPendingAreaSelection(area)
  ├─ setSelectedSource('area')
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
      ├─── 用户点击 Undo2 / 按 Esc ──→ setStatus('idle') + setCountdownValue(0)
      │                                      ↓
      │                              定时器检测 status !== 'countdown'
      │                              → 自动清理 interval，停止录制
      │                                      ↓
      │                              Toolbar UI: 恢复显示录制源按钮
      │
      └─── 倒计时结束 (count <= 0)
              ↓
          onStartRecording() → App.tsx
              ├─ 从 store 读取 pendingAreaSelection
              ├─ mediaCapturer.startDisplayCapture('screen:0:0')
              ├─ createCroppedStream(rawStream, pendingArea) ← 物理裁剪
              └─ recordingEngine.start()
                  │
                  ▼
              setStatus('recording')
                  │
                  ▼
              Toolbar UI: 显示录制计时器 + 停止按钮
```

---

## 代码分布

### 1. 触发选区 (Toolbar.tsx)

**文件**: `src/components/Toolbar.tsx` 第 94-97 行

```typescript
if (source === 'area') {
  setSelectedSource(source)
  window.caplet.startAreaSelection()
  return
}
```

**职责**: 用户点击"区域"按钮后，设置选中源并通知主进程打开选区窗口。

---

### 2. 选区窗口创建 (主进程)

**文件**: `src/main/index.ts` 第 226-293 行

```typescript
function createSelectionWindow() {
  if (selectionWindow) selectionWindow.close()

  const { x, y, width, height } = screen.getPrimaryDisplay().bounds

  selectionWindow = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
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

  selectionWindow.setAlwaysOnTop(true, 'screen-saver')
  selectionWindow.loadURL(`${baseUrl}#/area-selection`)
  // ...
}
```

**职责**: 创建全屏透明选区窗口，放置在主显示器上，层级设为 `screen-saver` 确保不被其他窗口覆盖。

---

### 3. IPC 通信 (Preload)

**文件**: `src/preload/index.ts` 第 16-35 行

```typescript
// 发送到主进程
startAreaSelection: () => ipcRenderer.send('start-area-selection'),
cancelAreaSelection: () => ipcRenderer.send('cancel-area-selection'),
sendAreaSelected: (area) => ipcRenderer.send('area-selected', area),

// 监听主进程消息
onAreaSelected: (callback) => {
  ipcRenderer.on('area-selected', handler)
  return () => ipcRenderer.removeListener('area-selected', handler)
},
onAreaSelectionCancelled: (callback) => { ... },
onSwitchToRecordingVisuals: (callback) => { ... },
```

---

### 4. 选区窗口确认/取消 (App.tsx)

**文件**: `src/App.tsx` 第 441-449 行

```typescript
function AreaOverlayForSelectionWindow() {
  const handleConfirm = (area: AreaSelection) => {
    window.caplet.sendAreaSelected(area)
  }
  const handleCancel = () => {
    window.caplet.cancelAreaSelection()
  }
  return <AreaOverlay onConfirm={handleConfirm} onCancel={handleCancel} />
}
```

**职责**: 选区窗口的入口组件，包装 AreaOverlay 并连接 IPC。

---

### 5. AreaOverlay 选区 UI 组件

**文件**: `src/components/AreaOverlay.tsx`

#### 5.1 确认/取消逻辑 (第 52-58 行)

```typescript
const handleKeyDown = useCallback((e: KeyboardEvent) => {
  if (e.key === 'Enter' && selection && selection.width > 10 && selection.height > 10) {
    onConfirm(selection)  // → sendAreaSelected
  } else if (e.key === 'Escape') {
    onCancel()           // → cancelAreaSelection
  }
}, [selection, onConfirm, onCancel])
```

#### 5.2 录制视觉模式切换 (第 22-28 行)

```typescript
useEffect(() => {
  const unlisten = window.caplet.onSwitchToRecordingVisuals(() => {
    setIsRecordingVisuals(true)  // 隐藏选区 UI，显示幽灵幕布
  })
  return () => unlisten()
}, [])
```

#### 5.3 选区确认后的窗口行为 (主进程 IPC)

**文件**: `src/main/index.ts` 第 505-516 行

```typescript
ipcMain.on('area-selected', (_, area) => {
  // 1. 开启鼠标穿透，保留遮罩为阴影幕布
  if (selectionWindow) {
    selectionWindow.setIgnoreMouseEvents(true, { forward: true })
    selectionWindow.webContents.send('switch-to-recording-visuals')
  }

  // 2. 显示主窗口
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('area-selected', area)
  }
})
```

---

### 6. 倒计时启动 (Toolbar.tsx)

**文件**: `src/components/Toolbar.tsx` 第 74-82 行

```typescript
useEffect(() => {
  const unlisten = window.caplet.onAreaSelected((area) => {
    setPendingAreaSelection(area)
    setSelectedSource('area')
    startCountdown(() => onStartRecording())
  })
  return () => unlisten()
}, [setSelectedSource, setPendingAreaSelection, startCountdown, onStartRecording])
```

**职责**: 监听 `area-selected` 事件，存储选区数据并启动倒计时。

---

### 7. useRecordingCountdown Hook

**文件**: `src/hooks/useRecordingCountdown.ts`

```typescript
export function useRecordingCountdown() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = useCallback((onComplete: () => void) => {
    // 1. 防抖清理
    if (timerRef.current) clearInterval(timerRef.current)

    const store = useAppStore.getState()
    const countdownSeconds = store.settings.countdown || 3

    // 2. 初始化状态
    store.setCountdownValue(countdownSeconds)
    store.setStatus('countdown')

    let count = countdownSeconds

    // 3. 读秒循环
    timerRef.current = setInterval(() => {
      // 状态嗅探自毁：如果 status 不是 countdown，清理定时器
      if (useAppStore.getState().status !== 'countdown') {
        clearInterval(timerRef.current!)
        timerRef.current = null
        return
      }

      count--
      if (count <= 0) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        onComplete()  // 倒计时结束，执行录制
      } else {
        useAppStore.getState().setCountdownValue(count)
      }
    }, 1000)
  }, [])

  return { startCountdown }
}
```

**职责**: 
- 统一管理倒计时逻辑
- 状态嗅探自毁机制（用户取消时自动清理定时器）
- 同步倒计时数值到 store

---

### 8. 倒计时取消 (回退逻辑)

**文件**: `src/components/Toolbar.tsx` 第 197-208 行

```typescript
<button
  onClick={() => {
    setStatus('idle')
    useAppStore.getState().setCountdownValue(0)
  }}
  className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-all"
  title="返回上一步 (Esc)"
>
  <Undo2 size={16} />
</button>
```

**回退流程**:
1. 用户点击 Undo2 按钮 → `setStatus('idle')`
2. `useRecordingCountdown` 的 `setInterval` 检测到 `status !== 'countdown'`
3. 自动清理定时器 (`clearInterval`)
4. Toolbar UI 恢复显示录制源按钮

---

### 9. 取消选区 (Esc)

**文件**: `src/main/index.ts` 第 518-524 行

```typescript
ipcMain.on('cancel-area-selection', () => {
  destroySelectionWindow()           // 关闭选区窗口
  if (mainWindow) {
    mainWindow.show()                // 显示主窗口
    mainWindow.webContents.send('area-selection-cancelled')
  }
})
```

**App.tsx 取消回调** (第 390-395 行):

```typescript
useEffect(() => {
  const unlisten = window.caplet.onAreaSelectionCancelled(() => {
    useAppStore.getState().setSelectedSource('display')  // 恢复默认源
  })
  return () => unlisten()
}, [])
```

---

### 10. 录制启动 (App.tsx)

**文件**: `src/App.tsx` 第 239-261 行

```typescript
} else if (currentSource === 'area') {
  const pendingArea = state.pendingAreaSelection
  if (!pendingArea) {
    console.error('[ZapRec] Area mode but no pending area selection')
    await window.caplet.streamEnd()
    setStatus('idle')
    return
  }

  // 1. 捕获全屏流
  const rawStream = await mediaCapturer.startDisplayCapture('screen:0:0')
  displayStreamRef.current = rawStream

  // 2. 物理画布裁剪
  displayStream = await createCroppedStream(rawStream, pendingArea)
  if (canvasRef.current) {
    recordingWidth = canvasRef.current.width
    recordingHeight = canvasRef.current.height
  }

  // 3. 清除已消费的选区
  useAppStore.getState().setPendingAreaSelection(null)
}
```

---

## 关键设计点

### 1. 状态嗅探自毁机制
`useRecordingCountdown` 中的定时器每次 tick 都检查 `status !== 'countdown'`，确保用户取消时定时器被正确清理，避免内存泄漏和状态不一致。

### 2. 鼠标穿透
选区确认后，`selectionWindow.setIgnoreMouseEvents(true, { forward: true })` 让选区窗口接收鼠标事件但不阻止点击穿透，确保用户在录制时仍能操作其他应用。

### 3. 幽灵幕布
录制期间，选区窗口保持打开但进入 `isRecordingVisuals` 状态，显示镂空的阴影幕布，既提供视觉反馈又不干扰用户操作。

### 4. 窗口状态管理
- 选区开始：主窗口隐藏
- 选区确认：主窗口显示，选区窗口转为鼠标穿透
- 选区取消：选区窗口销毁，主窗口显示
- 录制停止：选区窗口销毁 (`recording-stopped` IPC)
