# ZapRec 快捷键与文件名动态实现文档

## 一、快捷键操作动态实现

### 1.1 主进程注册 (src/main/index.ts:251-279)

主进程负责注册全局快捷键，并通过 IPC 事件通知渲染进程。

```typescript
function registerShortcuts() {
  const settings = getSettings() as Record<string, Record<string, string>>
  const shortcuts = settings.shortcuts || {}
  
  const toggleRecordKey = shortcuts.toggleRecord || 'Alt+Shift+R'
  const togglePauseKey = shortcuts.togglePause || 'Alt+Shift+P'
  const toggleVisibilityKey = shortcuts.toggleVisibility || 'Alt+Shift+H'
  
  try {
    globalShortcut.register(toggleRecordKey, () => {
      mainWindow?.webContents.send('shortcut:toggle-record')
    })
    
    globalShortcut.register(togglePauseKey, () => {
      mainWindow?.webContents.send('shortcut:toggle-pause')
    })
    
    globalShortcut.register(toggleVisibilityKey, () => {
      mainWindow?.webContents.send('shortcut:toggle-visibility')
    })
  } catch (e) {
    console.error('[Main] Failed to register shortcuts:', e)
  }
}

function updateShortcuts() {
  globalShortcut.unregisterAll()
  registerShortcuts()
}
```

- 注册时机：应用启动时 + 用户在设置中修改快捷键后
- 修改后自动重新注册：`ipcMain.handle('settings-set', ...)` 中调用 `updateShortcuts()`

### 1.2 Preload 通信桥 (src/preload/index.ts:71-85)

Preload 暴露监听器 API 给渲染进程。

```typescript
onShortcutToggleRecord: (callback: () => void) => {
  const handler = () => callback()
  ipcRenderer.on('shortcut:toggle-record', handler)
  return () => ipcRenderer.removeListener('shortcut:toggle-record', handler)
},
onShortcutTogglePause: (callback: () => void) => {
  const handler = () => callback()
  ipcRenderer.on('shortcut:toggle-pause', handler)
  return () => ipcRenderer.removeListener('shortcut:toggle-pause', handler)
},
onShortcutToggleVisibility: (callback: () => void) => {
  const handler = () => callback()
  ipcRenderer.on('shortcut:toggle-visibility', handler)
  return () => ipcRenderer.removeListener('shortcut:toggle-visibility', handler)
},
```

### 1.3 渲染进程处理 (src/App.tsx:450-502)

渲染进程监听 IPC 事件并执行业务逻辑。

```typescript
// 快捷键开始/停止录制
const unlistenRecord = window.caplet.onShortcutToggleRecord(() => {
  const s = useAppStore.getState().status
  if (s === 'recording' || s === 'paused') {
    stopRecording()
  } else if (s === 'idle') {
    // 快捷键开始录制时，先设置为全屏模式，然后走完整流程
    useAppStore.getState().setSelectedSource('display')
    startPreWarming()
    startCountdown()
  }
})

// 快捷键暂停/继续录制
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
      await window.caplet.streamStart(nextSegmentPath)
    }
  })
})

// 快捷键切换窗口可见性
const unlistenVisibility = window.caplet.onShortcutToggleVisibility(() => {
  window.caplet.toggleSettingsWindow()
})
```

---

## 二、文件名动态生成

### 2.1 文件名模板配置 (src/settings/types.ts:17, src/shared/types.ts:27,51)

```typescript
// settings/types.ts
filenameTemplate: string;  // 默认值: "{app}_{date}_{time}"

// shared/types.ts 默认值
filenameTemplate: '{app}_{date}_{time}'
```

支持的占位符：
- `{app}` - 应用名（默认 ZapRec）
- `{date}` - 日期（格式: YYYY-MM-DD）
- `{time}` - 时间（格式: HH-MM-SS）

### 2.2 生成逻辑 (src/App.tsx:155-164)

在开始录制时实时解析文件名模板。

```typescript
// 解析文件名模板
const template = currentSettings.filenameTemplate || '{app}_{date}_{time}'
const now = new Date()
const date = now.toISOString().split('T')[0]
const time = now.toTimeString().slice(0, 8).replace(/:/g, '-')
const filename = template
  .replace(/{app}/g, 'ZapRec')
  .replace(/{date}/g, date)
  .replace(/{time}/g, time)
const filepath = `${outputDir}/${filename}.mp4`
```

示例输出：`ZapRec_2026-04-28_14-30-00.mp4`

### 2.3 同步机制

文件名模板修改后通过 `settings-sync` 广播实时同步到应用：
1. 用户在设置中修改 filenameTemplate
2. 主进程收到 `settings-set` IPC，保存到磁盘
3. 主进程广播 `settings-sync` 事件
4. App.tsx 监听并调用 `syncSettings` 更新 Zustand store
5. 录制时读取最新模板

---

## 三、相关文件索引

| 文件 | 职责 |
|------|------|
| src/main/index.ts | 快捷键注册、设置持久化、广播 |
| src/preload/index.ts | IPC 事件监听器暴露 |
| src/settings/types.ts | filenameTemplate 类型定义 |
| src/shared/types.ts | 默认值定义 |
| src/store/useAppStore.ts | syncSettings action |
| src/App.tsx | 监听器业务逻辑、文件名生成 |