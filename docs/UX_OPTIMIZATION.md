# ZapRec UX 优化问题汇总

## 问题一：关闭设置界面时工具条闪现

### 问题描述
点击设置界面关闭按钮后，工具条的显示和设置界面的关闭是同时发送的，导致两者会短暂同框出现。

**当前代码 (src/main/index.ts:541-546)**:
```typescript
ipcMain.on('close-settings', () => {
  destroySettingsWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
  }
})
```

### 期望行为
先完全关闭设置界面，再显示工具条。使用透明度渐显实现丝滑过渡。

### 优化方案
```typescript
ipcMain.on('close-settings', () => {
  destroySettingsWindow()
  // 延迟显示工具条，给设置窗口一点时间完全销毁
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(0)
      mainWindow.showInactive()
      setTimeout(() => mainWindow?.setOpacity(1), 50)
    }
  }, 50)
})
```

---

## 问题二：点击"查看录屏"跳转延迟

### 问题描述
点击托盘菜单"查看录屏"后，设置面板打开后会短暂停留在通用标签页，然后才切换到录屏管理页。

**当前代码 (src/main/index.ts:512-532)**:
```typescript
function openSettingsWindow(targetTab?: string) {
  if (settingsWindow) {
    settingsWindow.show()
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore()
    }
    settingsWindow.focus()
    if (targetTab) {
      // 问题：did-finish-load 事件可能在窗口已加载后不再触发
      settingsWindow.webContents.once('did-finish-load', () => {
        settingsWindow?.webContents.send('navigate-to-tab', targetTab)
      })
    }
  } else {
    createSettingsWindow()
    if (targetTab) {
      // 问题：500ms 延迟太长，用户能感知到切换
      setTimeout(() => {
        settingsWindow?.webContents.send('navigate-to-tab', targetTab)
      }, 500)
    }
  }
}
```

### 期望行为
打开设置面板时直接显示目标标签页，用户无感知切换。

### 优化方案
窗口已存在时直接发送导航消息，窗口新建时使用更短的延迟：

```typescript
function openSettingsWindow(targetTab?: string) {
  if (settingsWindow) {
    settingsWindow.show()
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore()
    }
    settingsWindow.focus()
    if (targetTab) {
      // 窗口已存在，直接发送导航消息
      settingsWindow.webContents.send('navigate-to-tab', targetTab)
    }
  } else {
    createSettingsWindow()
    if (targetTab) {
      // 减少延迟到 100ms，用户基本无感知
      setTimeout(() => {
        settingsWindow?.webContents.send('navigate-to-tab', targetTab)
      }, 100)
    }
  }
}
```

---

## 问题三：摄像头小窗关闭后工具条不显示

### 问题描述
纯摄像头模式下，点击摄像头小窗右上角的关闭按钮后，结束了录制但没有恢复显示工具条。

**当前代码 (src/main/index.ts:1028-1037)**:
```typescript
ipcMain.on('close-camera-preview-window', () => {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
    cameraPreviewWindow = null
  }
  if (cameraRecordingWindow) {
    cameraRecordingWindow.close()
    cameraRecordingWindow = null
  }
})
```

### 期望行为
点击关闭按钮后：
1. 结束录制（发送 `recording-stop-requested`）
2. 关闭摄像头小窗
3. 显示工具条（复用丝滑显示逻辑）

### 优化方案
```typescript
ipcMain.on('close-camera-preview-window', () => {
  // 1. 通知主窗口停止录制
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-stop-requested')
  }

  // 2. 关闭摄像头窗口
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
    cameraPreviewWindow = null
  }
  if (cameraRecordingWindow) {
    cameraRecordingWindow.close()
    cameraRecordingWindow = null
  }

  // 3. 重置录制模式
  currentRecordingMode = null

  // 4. 显示工具条（丝滑效果）
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(0)
      mainWindow.showInactive()
      setTimeout(() => mainWindow?.setOpacity(1), 50)
    }
  }, 50)
})
```

---

## 通用：丝滑显示工具条函数封装

为了保持代码一致性，建议封装统一的工具条显示函数：

```typescript
function showMainWindowSmooth() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(0)
    mainWindow.showInactive()
    setTimeout(() => mainWindow?.setOpacity(1), 50)
  }
}
```

替换以下位置的工具条显示逻辑：
- `close-settings` IPC 处理
- `close-camera-preview-window` IPC 处理
- 托盘菜单"显示主窗口"点击事件
- 快捷键触发后的窗口显示

---

## 相关文件索引

| 文件 | 涉及内容 |
|------|---------|
| src/main/index.ts | IPC 处理函数：close-settings, open-settings, close-camera-preview-window |
| src/settings/components/SettingsLayout.tsx | 导航事件监听 onNavigateTab |
| src/preload/index.ts | API 暴露 onNavigateTab |
| src/global.d.ts | 类型定义 |