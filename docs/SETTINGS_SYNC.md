# ZapRec 设置面板与业务逻辑同步说明书

## 一、概述

设置面板（Settings Window）中的配置项通过 IPC 机制与主进程、业务逻辑进行双向同步。

**核心机制**：
- 渲染进程（Settings Window）通过 `settingsSet` 修改配置 → 主进程接收并持久化
- 主进程启动时加载配置 → 根据配置执行对应操作（快捷键注册、质量设置等）
- 业务代码从配置中读取参数 → 应用到录制流程

---

## 二、配置存储结构

### 2.1 配置文件（JSON）

位于 `%APPDATA%/zaprec/config.json`

```json
{
  "general": {
    "countdownSeconds": 3,        // 录制倒计时（秒）
    "fps": 60,                 // 帧率（30 | 60）
    "resolution": "original",   // 分辨率（"original" | "1080P"）
    "minimizeToTrayOnClose": true  // 关闭时最小化到托盘
  },
  "shortcuts": {
    "toggleRecord": "Alt+Shift+R",      // 开始/停止录制
    "togglePause": "Alt+Shift+P",       // 暂停/恢复录制
    "toggleVisibility": "Alt+Shift+H"   // 工具条显隐
  },
  "storage": {
    "saveDirectory": "C:\\Users\\xxx\\Downloads",  // 保存目录
    "filenameTemplate": "{app}_{date}_{time}"     // 文件名模板
  },
  "lastState": {
    "microphoneEnabled": false,  // 麦克风开关状态
    "systemAudioEnabled": false,  // 系统音开关状态
    "pipEnabled": false         // 画中画开关状态
  }
}
```

### 2.2 类型定义

**文件**: `src/settings/types.ts`

```typescript
export interface GeneralSettings {
  countdownSeconds: number;
  fps: 30 | 60;
  resolution: "original" | "1080P";
  minimizeToTrayOnClose: boolean;
}

export interface ShortcutSettings {
  toggleRecord: string;
  togglePause: string;
  toggleVisibility: string;
}

export interface StorageSettings {
  saveDirectory: string;
  filenameTemplate: string;
}

export interface LastStateSettings {
  microphoneEnabled: boolean;
  systemAudioEnabled: boolean;
  pipEnabled: boolean;
}
```

---

## 三、各设置项的同步链路

### 3.1 快捷键设置（shortcuts）

#### 修改流程

```
Shortcuts.tsx (用户输入快捷键)
    ↓ setSetting('shortcuts.toggleRecord', 'Alt+Shift+R')
Preload (settingsSet API)
    ↓ ipcRenderer.invoke('settings-set', key, value)
Main Process (settings-set handler)
    ↓ setSetting(key, value) → 保存到 config.json
    ↓ 检测到 key 以 'shortcuts.' 开头
    ↓ updateShortcuts() → 重新注册全局快捷键
```

#### 关键代码

**Shortcuts.tsx:23**
```typescript
setSetting(`shortcuts.${key}`, shortcut)
```

**main/index.ts:385-390**
```typescript
ipcMain.handle('settings-set', (_, key: string, value: unknown) => {
  setSetting(key, value)
  if (key.startsWith('shortcuts.')) {
    updateShortcuts()
  }
})
```

**main/index.ts:258-274**
```typescript
function updateShortcuts() {
  globalShortcut.unregisterAll()
  registerShortcuts()
}

function registerShortcuts() {
  const settings = getSettings()
  const shortcuts = settings.shortcuts || {}
  
  const toggleRecordKey = shortcuts.toggleRecord || 'Alt+Shift+R'
  const togglePauseKey = shortcuts.togglePause || 'Alt+Shift+P'
  
  globalShortcut.register(toggleRecordKey, () => {
    mainWindow?.webContents.send('shortcut:toggle-record')
  })
  
  globalShortcut.register(togglePauseKey, () => {
    mainWindow?.webContents.send('shortcut:toggle-pause')
  })
}
```

#### 业务触发

**main/index.ts:260-265**
- 快捷键触发后发�� IPC 消息到渲染进程
- `shortcut:toggle-record` → 调用 `onShortcutToggleRecord` 回调
- `shortcut:toggle-pause` → 调用 `onShortcutTogglePause` 回调

---

### 3.2 录制倒计时（general.countdownSeconds）

#### 修改流程

```
General.tsx (用户设置倒计时)
    ↓ setSetting('general.countdownSeconds', 5)
Preload → Main Process → 保存到 config.json
    ↓ 持久化
```

#### 业务读取

**src/hooks/useRecordingCountdown.ts:12-21**
```typescript
useEffect(() => {
  ;(window.caplet as any).settingsLoad().then((settings) => {
    const general = settings.general
    if (general) {
      countdownRef.current = general.countdownSeconds || 3
    }
  })
}, [])

const startCountdown = useCallback(() => {
  const countdownSeconds = countdownRef.current
  // ... 倒计时逻辑
}, [])
```

---

### 3.3 视频帧率（general.fps）

#### 修改流程

```
General.tsx (用户设置 FPS)
    ↓ setSetting('general.fps', 60)
Preload → Main Process → 保存到 config.json
```

#### 业务读取

**src/App.tsx:55-75** (启动时加载)
```typescript
useEffect(() => {
  const loadLastState = async () => {
    const settings = await (window.caplet as any).settingsLoad()
    const general = settings.general
    if (general) {
      const fps = general.fps
      let quality = '1080p'
      if (fps === 30) quality = '1080p'
      else if (fps === 60) quality = '1080p60'
      store.setSettings({ quality })
    }
  }
  loadLastState()
}, [])
```

#### QUALITY_PRESETS 映射

**src/shared/types.ts:18-22**
```typescript
export const QUALITY_PRESETS = {
  '720p': { width: 1280, height: 720, fps: 30 },
  '1080p': { width: 1920, height: 1080, fps: 30 },
  '1080p60': { width: 1920, height: 1080, fps: 60 }
}
```

---

### 3.4 状态记忆（lastState）

#### 修改流程

```
Toolbar.tsx (用户点击麦克风开关)
    ↓ (window.caplet as any).settingsSet('lastState.microphoneEnabled', true)
Preload → Main Process → 保存到 config.json
```

#### 业务读取

**src/App.tsx:55-75** (启动时加载)
```typescript
useEffect(() => {
  const loadLastState = async () => {
    const settings = await (window.caplet as any).settingsLoad()
    const lastState = settings.lastState
    if (lastState) {
      setMicrophoneEnabled(lastState.microphoneEnabled ?? false)
      setSystemAudioEnabled(lastState.systemAudioEnabled ?? false)
      setPipEnabled(lastState.pipEnabled ?? false)
    }
  }
  loadLastState()
}, [])
```

---

### 3.5 文件名模板（storage.filenameTemplate）

#### 修改流程

```
Recordings.tsx (用户设置文件名模板)
    ↓ setSetting('storage.filenameTemplate', '{app}_{date}_{time}')
Preload → Main Process → 保存到 config.json
```

#### 模板变量

| 变量 | 说明 | 示例 |
|-----|------|------|
| `{app}` | 应用名称 | ZapRec |
| `{date}` | 录制日期 | 2026-04-28 |
| `{time}` | 录制时间 | 14-30-05 |

#### 业务生成

**需在录制引擎中实现模板替换逻辑**

```typescript
// 伪代码
const template = settings.storage?.filenameTemplate || '{app}_{date}_{time}'
const appName = app.getName()
const date = new Date().toISOString().split('T')[0]
const time = new Date().toTimeString().slice(0, 8).replace(/:/g, '-')
const filename = template
  .replace('{app}', appName)
  .replace('{date}', date)
  .replace('{time}', time)
  + '.mp4'
```

---

## 四、IPC API 列表

### 4.1 设置相关

| IPC 名称 | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `settings-load` | - | Settings | 加载全部配置 |
| `settings-set` | key, value | - | 单字段更新（快捷键自动重注册） |
| `settings-reset` | - | Settings | 恢复默认配置 |

### 4.2 文件相关

| IPC 名称 | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `get-recordings` | path | RecordingItem[] | 获取目录下的录像列表 |
| `delete-recordings` | paths[] | string[] | 批量删除录像 |
| `open-in-folder` | filePath | - | 在资源管理器中显示 |
| `select-directory` | - | path \| null | 选择保存目录 |

### 4.3 窗口相关

| IPC 名称 | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `open-settings` | - | - | 打开设置窗口 |
| `close-settings` | - | - | 关闭设置窗口 |
| `settings-window-minimize` | - | - | 最小化设置窗口 |
| `window-maximize` | - | - | 切换最大化状态 |

### 4.4 工具相关

| IPC 名称 | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `get-app-name` | - | string | 获取应用名称 |

---

## 五、文件清单

| 文件 | 职责 |
|------|------|
| `src/settings/types.ts` | 配置 TS 类型定义 |
| `src/settings/hooks/useSettings.ts` | Settings 状态 Hook (IPC 封装) |
| `src/settings/pages/General.tsx` | 通用设置 Tab UI |
| `src/settings/pages/Shortcuts.tsx` | 快捷键设置 Tab UI |
| `src/settings/pages/Recordings.tsx` | 录屏管理 Tab UI |
| `src/settings/components/SettingsLayout.tsx` | 设置窗口布局 |
| `src/main/index.ts` | 主进程：配置持久化 + IPC  handlers |
| `src/preload/index.ts` | Preload：API 暴露 |
| `src/App.tsx` | 主窗口：启动时加载配置 |
| `src/hooks/useRecordingCountdown.ts` | 倒计时 Hook：读取配置的倒计时 |
| `src/store/useAppStore.ts` | Zustand 状态管理 |

---

## 六、注意事项

1. **快捷键实时生效**: 修改快捷键后主进程会自动重新注册，无需重启应用
2. **状态即时保存**: lastState（麦克风/系统音/画中画）在 Toolbar 中操作时即时保存，无需打开设置窗口
3. **帧率映射**: 30fps → `1080p`，60fps → `1080p60`（720p 未实现）
4. **文件名模板**: 需在录制引擎中实现模板替换，当前仅存储配置