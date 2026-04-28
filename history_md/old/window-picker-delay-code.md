# 问题 1：窗口选择界面弹出延迟

## 问题描述

点击"窗口"录制按钮后，需要等待 3-5 秒，带预览页的选择界面才弹出。

---

## 相关代码

### 1. Toolbar.tsx - 点击 window 按钮（第 120-130 行）

```tsx
if (source === 'window') {
  const store = useAppStore.getState()
  if (store.pipEnabled) {
    store.setSavedPipEnabled(true)
    store.setPipEnabled(false)
  }
  store.setPipButtonDisabled(true)
  setSelectedSource(source)
  onOpenWindowPicker?.()
  return
}
```

### 2. App.tsx - handleOpenWindowPicker（第 518-521 行）

```tsx
const handleOpenWindowPicker = useCallback(() => {
  useAppStore.getState().setSelectedSource('window')
  window.caplet.startWindowPicker()
}, [])
```

### 3. preload/index.ts - 暴露 API（第 17 行）

```tsx
startWindowPicker: () => ipcRenderer.send('start-window-picker'),
```

### 4. main/index.ts - 接收 IPC 并处理（第 561-566 行）

```tsx
ipcMain.on('start-window-picker', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createWindowPickerWindow()
})
```

### 5. main/index.ts - 创建窗口选择器（第 329-380 行）

```tsx
function createWindowPickerWindow() {
  if (windowPickerWindow) {
    windowPickerWindow.close()
  }

  const { x, y, width, height } = screen.getPrimaryDisplay().bounds

  windowPickerWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    movable: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    type: 'toolbar',
    minWidth: width,
    maxWidth: width,
    minHeight: height,
    maxHeight: height,
    show: false, // 先创建后加载，避免加载时的闪烁和系统边框
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  windowPickerWindow.setResizable(false)
  windowPickerWindow.setMovable(false)
  windowPickerWindow.setAlwaysOnTop(true, 'screen-saver')

  // 核心修改 2：当页面完成首次视觉绘制（HTML/CSS 已经撑满全屏）时，瞬间显示窗口
  windowPickerWindow.once('ready-to-show', () => {
    if (windowPickerWindow) {
      windowPickerWindow.show()
    }
  })
  
  if (VITE_DEV_SERVER_URL) {
    windowPickerWindow.loadURL(`${VITE_DEV_SERVER_URL.replace('/index.html', '')}/window-picker.html`)
  } else {
    windowPickerWindow.loadFile(path.join(__dirname, '../../dist/window-picker.html'))
  }

  if (process.platform === 'win32') {
    windowPickerWindow.hookWindowMessage(0x0084, (_e, result) => {
      result.writeInt32LE(1, 0)
      return true
    })
  }
  // ...
}
```

---

## 流程分析

```
点击 window 按钮
    ↓
Toolbar.handleSourceClick('window')
    ↓
onOpenWindowPicker() → handleOpenWindowPicker()
    ↓
window.caplet.startWindowPicker() [IPC]
    ↓
main/index.ts: ipcMain.on('start-window-picker')
    ↓
mainWindow.hide()
    ↓
createWindowPickerWindow()
    ↓
new BrowserWindow({ show: false })
    ↓
windowPickerWindow.once('ready-to-show') 注册事件
    ↓
loadURL/loadFile (加载 window-picker.html)
    ↓
[延迟：HTML 加载 + JS 执行 + 首帧渲染]
    ↓
ready-to-show 事件触发
    ↓
windowPickerWindow.show()
```

---

## 延迟可能来源

| 阶段 | 可能耗时 |
|------|----------|
| IPC 通信 | ~50ms |
| mainWindow.hide() | ~100-300ms |
| BrowserWindow 创建 | ~100-200ms |
| loadURL/loadFile | 500ms - 2s（取决于网络/本地） |
| window-picker.html 解析渲染 | 500ms - 2s |
| ready-to-show 触发 | 取决于页面渲染完成时间 |

**总计**：通常 1-3 秒，如果页面加载慢或渲染复杂可达 3-5 秒
