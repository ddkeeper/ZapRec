# 设置面板问题修复文档

## 问题 1: 录屏管理表格无法自适应窗口大小

### 问题描述
设置窗口内的录屏管理区域内容区是固定高度的，不会随着窗口大小自动缩放，导致内容无法滚动查看。

### 修复方案
修改 `src/settings/pages/Recordings.tsx`，使用 Flexbox 布局实现自适应：

```tsx
// 模块 2：录屏列表
<div className="flex flex-col min-h-0">
  <div className="flex items-center justify-between mb-3 ml-1 shrink-0">
    <h2 className="text-sm font-semibold text-slate-800">录屏管理</h2>
    ...
  </div>

  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm flex flex-col min-h-[200px]">
    <table className="w-full text-left border-collapse table-fixed">
      <thead className="bg-slate-50/80 border-b border-slate-200 shrink-0">
        ...
      </thead>
      <tbody className="divide-y divide-slate-100 overflow-y-auto flex-1">
        ...
      </tbody>
    </table>
  </div>
</div>
```

### 关键修复点
- `min-h-0`：允许容器收缩到 0 高度
- `shrink-0`：防止表头被压缩
- `flex-1`：让 tbody 自动填充剩余空间
- `overflow-y-auto`：内容超出时显示滚动条
- `min-h-[200px]`：设置最小高度确保内容可见

---

## 问题 2: 开关状态未持久化

### 问题描述
重启应用后，工具条右侧的麦克风、系统音、画中画开关状态总是重置为关闭状态。

### 修复方案

#### 2.1 保存状态 (Toolbar.tsx)
每次点击开关时调用 `settingsSet()` 保存状态到 JSON 文件：

```tsx
<button
  onClick={() => {
    const newValue = !microphoneEnabled
    setMicrophoneEnabled(newValue)
    ;(window.caplet as any).settingsSet('lastState.microphoneEnabled', newValue)
  }}
>
  ...
</button>
```

#### 2.2 加载状态 (Toolbar.tsx)
在组件挂载时从 JSON 文件加载上次保存的状态：

```tsx
useEffect(() => {
  ;(window.caplet as any).settingsLoad().then((settings: { lastState?: { microphoneEnabled?: boolean; systemAudioEnabled?: boolean; pipEnabled?: boolean } }) => {
    if (settings.lastState) {
      if (typeof settings.lastState.microphoneEnabled === 'boolean') {
        setMicrophoneEnabled(settings.lastState.microphoneEnabled)
      }
      if (typeof settings.lastState.systemAudioEnabled === 'boolean') {
        setSystemAudioEnabled(settings.lastState.systemAudioEnabled)
      }
      if (typeof settings.lastState.pipEnabled === 'boolean') {
        setPipEnabled(settings.lastState.pipEnabled)
      }
    }
  }).catch(console.error)
}, [])
```

#### 2.3 后端存储 (main/index.ts)
主进程通过 JSON 文件存储和加载设置：

```typescript
// JSON 文件存储
function getSettingsFilePath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function loadSettings() {
  // 加载 JSON 文件
}

function saveSettings() {
  // 写入 JSON 文件
}

// IPC handlers
ipcMain.handle('settings-load', () => settingsData)
ipcMain.handle('settings-set', (_, key, value) => {
  // 更新 settingsData 并保存
  saveSettings()
})
```

---

## 问题 3: 设置关闭按钮顺序

### 问题描述
点击设置面板的关闭按钮后，设置窗口和工具条窗口会重叠显示，没有正确的关闭顺序。

### 修复方案
修改 `src/main/index.ts` 中的 `close-settings` IPC handler，添加延迟确保先关闭设置窗口再显示主窗口：

```typescript
ipcMain.on('close-settings', () => {
  destroySettingsWindow()
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
    }
  }, 50)
})
```

### 关键点
- **先销毁**：先调用 `destroySettingsWindow()` 关闭设置窗口
- **延迟显示**：使用 `setTimeout(..., 50)` 延迟 50ms 再显示主窗口，确保两个窗口不会重叠

---

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/settings/pages/Recordings.tsx` | 添加 flex 布局实现表格自适应 |
| `src/components/Toolbar.tsx` | 添加 settingsLoad() 和 settingsSet() 调用 |
| `src/main/index.ts` | 添加 JSON 存储逻辑和 close-settings 延迟 |
| `src/preload/index.ts` | 添加 settingsLoad/settingsSet API |