# 快捷键与设置同步实现文档

## 一、主进程快捷键动态注册

### 1.1 registerShortcuts() 函数 (src/main/index.ts:220-252)

```typescript
function registerShortcuts() {
  // 从 settings 读取快捷键配置，使用默认值
  const shortcutsData = (settingsData as any).shortcuts || {}
  const toggleRecordKey = shortcutsData.toggleRecord || 'Alt+Shift+R'
  const togglePauseKey = shortcutsData.togglePause || 'Alt+Shift+P'
  const toggleVisibilityKey = shortcutsData.toggleVisibility || 'Alt+Shift+H'
  
  // 注册开始/停止录制快捷键
  globalShortcut.register(toggleRecordKey, () => {
    mainWindow?.webContents.send('shortcut:toggle-record')
  })
  
  // 注册暂停/继续录制快捷键
  globalShortcut.register(togglePauseKey, () => {
    mainWindow?.webContents.send('shortcut:toggle-pause')
  })
  
  // 注册工具条显隐快捷键（带障眼法）
  globalShortcut.register(toggleVisibilityKey, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        const win = mainWindow!
        win.setOpacity(0)
        win.showInactive()
        setTimeout(() => win.setOpacity(1), 50)
      }
    }
  })
}
```

### 1.2 updateShortcuts() 函数

```typescript
function updateShortcuts() {
  globalShortcut.unregisterAll()
  registerShortcuts()
}
```

---

## 二、设置变更广播

### 2.1 settings-set 处理函数 (src/main/index.ts:308-324)

```typescript
ipcMain.handle('settings-set', (_, key: string, value: unknown) => {
  const keys = key.split('.')
  if (keys.length === 2) {
    ;(settingsData as any)[keys[0]] = {
      ...(settingsData as any)[keys[0]],
      [keys[1]]: value
    }
  } else {
    settingsData[key] = value
  }
  saveSettings()
  
  // 快捷键设置修改后重新注册
  if (key.startsWith('shortcuts.')) {
    updateShortcuts()
  }
  
  // 广播 settings-sync 事件到渲染进程
  mainWindow?.webContents.send('settings-sync', settingsData)
})
```

---

## 三、工具条显隐函数封装

### 3.1 showToolbar() 函数 (src/main/index.ts:934-950)

```typescript
function showToolbar() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isVisible()) {
      // 已可见则聚焦
      mainWindow.focus()
    } else {
      // 隐藏状态：使用障眼法显示
      const win = mainWindow
      win.setOpacity(0)
      win.showInactive()
      setTimeout(() => win.setOpacity(1), 50)
    }
  }
}

// 注册 IPC 监听
ipcMain.on('show-toolbar', showToolbar)
```

### 3.2 close-settings 中使用 showToolbar

```typescript
ipcMain.on('close-settings', () => {
  destroySettingsWindow()
  setTimeout(() => {
    showToolbar()
  }, 50)
})
```

---

## 四、Preload 通信桥

### 4.1 暴露 API (src/preload/index.ts:30-32)

```typescript
showToolbar: () => ipcRenderer.send('show-toolbar'),
```

### 4.2 设置同步监听

```typescript
onSettingsSync: (callback: (settings: Record<string, unknown>) => void) => {
  const handler = (_: unknown, settings: Record<string, unknown>) => callback(settings)
  ipcRenderer.on('settings-sync', handler)
  return () => ipcRenderer.removeListener('settings-sync', handler)
},
```

---

## 五、渲染进程处理

### 5.1 App.tsx 设置缓存与监听 (src/App.tsx:524-542)

```typescript
const settingsRef = useRef<Record<string, unknown> | null>(null)

useEffect(() => {
  const unlistenSettingsSync = (window.caplet as any).onSettingsSync((settings: any) => {
    settingsRef.current = settings
    const general = settings?.general
    const shortcuts = settings?.shortcuts
    const storage = settings?.storage
    if (general || shortcuts || storage) {
      useAppStore.getState().setSettings({
        ...(general ? { quality: general.fps === 30 ? 'low' : general.fps === 60 ? 'medium' : 'high' } : {}),
        ...(storage ? { outputDirectory: storage.saveDirectory } : {}),
      } as any)
    }
  })
  return () => unlistenSettingsSync()
}, [])
```

### 5.2 开始/暂停快捷键处理

```typescript
const unlistenRecord = (window.caplet as any).onShortcutToggleRecord(async () => {
  const s = useAppStore.getState().status
  if (s === 'recording' || s === 'paused') {
    (window.caplet as any).showToolbar?.()
    stopRecording()
  } else if (s === 'idle') {
    (window.caplet as any).showToolbar?.()
    ;(window.caplet as any).settingsWindowMinimize?.()
    useAppStore.getState().setSelectedSource('display')
    startPreWarming()
    startCountdown()
  }
})
```

### 5.3 暂停/继续快捷键处理

```typescript
const unlistenPause = window.caplet.onShortcutTogglePause(() => {
  const store = useAppStore.getState()
  if (store.status !== 'recording' && store.status !== 'paused') return

  ;(window.caplet as any).showToolbar?.()
  const newPaused = !store.isPaused
  store.setIsPaused(newPaused)
  setStatus(newPaused ? 'paused' : 'recording')
  // ... 暂停/继续逻辑
})
```

### 5.4 显隐快捷键处理

```typescript
const unlistenVisibility = (window.caplet as any).onShortcutToggleVisibility(async () => {
  const store = useAppStore.getState()
  const s = store.status
  
  if (s === 'recording' || s === 'paused') {
    (window.caplet as any).showToolbar?.()
    ;(window.caplet as any).settingsWindowMinimize?.()
    stopRecording()
  } else if (s === 'idle') {
    (window.caplet as any).showToolbar?.()
  }
})
```

---

## 六、JIT 设置读取

### 6.1 录制时读取最新设置 (src/App.tsx:105-112)

```typescript
const caplet = window.caplet as any
// 使用缓存或首次通过 IPC 读取
const settings = settingsRef.current || await caplet.settingsLoad()
if (!settingsRef.current) settingsRef.current = settings

const fps = settings?.general?.fps ?? 60
const resolution = settings?.general?.resolution ?? 'original'
```

### 6.2 文件名模板 JIT

```typescript
const template = settings?.storage?.filenameTemplate || '{app}_{date}_{time}'
const now = new Date()
const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`
const appName = 'ZapRec'
const filename = template.replace(/{app}/g, appName).replace(/{date}/g, dateStr).replace(/{time}/g, timeStr)
```

---

## 七、工作流程

```
用户修改快捷键设置
        ↓
settings-set IPC
        ↓
main 保存到文件
        ↓
updateShortcuts() 重新注册
        ↓
broadcast settings-sync
        ↓
App.tsx 缓存 settings
        ↓
下次录制时 JIT 读取
```

---

## 八、相关文件索引

| 文件 | 职责 |
|------|------|
| src/main/index.ts | 快捷键注册、设置保存、showToolbar 函数 |
| src/preload/index.ts | IPC 事件暴露 |
| src/App.tsx | 快捷键监听、JIT 设置读取 |
| src/global.d.ts | window.caplet 类型定义 |
| src/hooks/useRecordingCountdown.ts | JIT 倒计时秒数读取 |