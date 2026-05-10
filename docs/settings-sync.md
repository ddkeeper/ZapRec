# 设置面板与运行逻辑同步文档

## 1. 设置数据结构定义

### 1.1 默认设置（主进程）

```typescript
// src/main/index.ts

const DEFAULT_SETTINGS_DATA = {
  general: {
    countdownSeconds: 3,      // 录制倒计时秒数
    fps: 60,                   // 视频帧率 (30 或 60)
    resolution: 'original',     // 录制分辨率 ('original' 或 '1080P')
    minimizeToTrayOnClose: true, // 关闭时最小化到托盘
  },
  shortcuts: {
    toggleRecord: 'Alt+Shift+R',      // 开始/停止录制
    togglePause: 'Alt+Shift+P',       // 暂停/恢复录制
    toggleVisibility: 'Alt+Shift+H',   // 唤出/隐藏工具条
  },
  storage: {
    saveDirectory: '',              // 保存目录
    filenamePrefix: 'ZapRec',      // 文件名前缀
    filenameTemplate: '{app}_{date}_{time}', // 文件命名模板
  },
  lastState: {
    microphoneEnabled: false,    // 上次麦克风状态
    systemAudioEnabled: false,  // 上次系统音频状态
    pipEnabled: false,        // 上次画中画状态
  },
}
```

### 1.2 设置面板（React）

```typescript
// src/settings/hooks/useSettings.ts

const DEFAULT_SETTINGS_LOCAL = {
  general: {
    countdownSeconds: 3,
    fps: 60,
    resolution: 'original',
    minimizeToTrayOnClose: true,
  },
  shortcuts: {
    toggleRecord: 'Alt+Shift+R',
    togglePause: 'Alt+Shift+P',
    toggleVisibility: 'Alt+Shift+H',
  },
  storage: {
    saveDirectory: '',
    filenamePrefix: 'ZapRec',
    filenameTemplate: '{app}_{date}_{time}',
  },
  lastState: {
    microphoneEnabled: false,
    systemAudioEnabled: false,
    pipEnabled: false,
  },
}
```

## 2. 设置持久化（主进程）

```typescript
// src/main/index.ts

let settingsData = { ...DEFAULT_SETTINGS_DATA }
let settingsLoaded = false

// 获取设置文件路径
function getSettingsFilePath() {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'settings.json')
}

// 加载设置
function loadSettings() {
  const filePath = getSettingsFilePath()
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      settingsData = { ...DEFAULT_SETTINGS_DATA, ...JSON.parse(data) }
    } else {
      settingsData = { ...DEFAULT_SETTINGS_DATA }
      settingsData.storage = { saveDirectory: app.getPath('downloads') }
    }
  } catch (e) {
    console.error('[Main] Failed to load settings:', e)
    settingsData = { ...DEFAULT_SETTINGS_DATA }
  }
  settingsLoaded = true
}

// 保存设置
function saveSettings() {
  if (!settingsLoaded) return
  const filePath = getSettingsFilePath()
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(settingsData, null, 2), 'utf-8')
  } catch (e) {
    console.error('[Main] Failed to save settings:', e)
  }
}

// IPC 处理器
ipcMain.handle('settings-load', () => {
  return settingsData
})

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
})

ipcMain.handle('settings-reset', () => {
  settingsData = { ...DEFAULT_SETTINGS_DATA }
  settingsData.storage = { saveDirectory: app.getPath('downloads') }
  saveSettings()
  return settingsData
})
```

## 3. Preload 暴露的方法

```typescript
// src/preload/index.ts

settingsLoad: () => ipcRenderer.invoke('settings-load'),
settingsSet: (key: string, value: unknown) => ipcRenderer.invoke('settings-set', key, value),

// 设置窗口相关
openSettings: () => ipcRenderer.send('open-settings'),
settingsWindowMinimize: () => ipcRenderer.invoke('settings-window-minimize'),
closeSettings: () => ipcRenderer.send('close-settings'),

// 打开文件夹
openInFolder: (filepath: string) => ipcRenderer.invoke('show-item-in-folder', filepath),

// 选择目录
selectDirectory: () => ipcRenderer.invoke('select-directory'),

// 获取 Recordings
getRecordings: (dirPath: string) => ipcRenderer.invoke('get-recordings', dirPath),

// 删除 Recordings
deleteRecordings: (filePaths: string[]) => ipcRenderer.invoke('delete-recordings', filePaths),
```

## 4. 设置面板 UI 代码

### 4.1 通用设置（General.tsx）

```tsx
// src/settings/pages/General.tsx
import { useSettings } from '../hooks/useSettings'

export function General() {
  const { settings, updateSettings, setSetting } = useSettings()

  return (
    <div className="space-y-6">
      {/* 模块 1：录制设置 */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3 ml-1">录制设置</h2>
        
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
          {/* 录制倒计时 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-slate-800">录制倒计时</span>
              <span className="text-[12px] text-slate-500 mt-0.5">开启录制前的缓冲时间</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="10"
                value={settings.general.countdownSeconds}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0
                  updateSettings('general', { countdownSeconds: val })
                  setSetting('general.countdownSeconds', val)
                }}
                className="w-14 px-2 py-1 bg-white border border-slate-200 rounded text-center text-[13px] text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <span className="text-[12px] text-slate-500">秒</span>
            </div>
          </div>

          {/* 视频帧率 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-slate-800">视频帧率</span>
              <span className="text-[12px] text-slate-500 mt-0.5">选择录制视频的流畅度</span>
            </div>
            <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200">
              {[30, 60].map((fps) => (
                <button
                  key={fps}
                  onClick={() => {
                    updateSettings('general', { fps: fps as 30 | 60 })
                    setSetting('general.fps', fps)
                  }}
                  className={`px-3 py-1 text-[12px] font-medium rounded-sm transition-all ${
                    settings.general.fps === fps
                      ? 'bg-white shadow-sm text-slate-800 border border-slate-200/50'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {fps} FPS
                </button>
              ))}
            </div>
          </div>

          {/* 录制分辨率 */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-slate-800">录制分辨率</span>
              <span className="text-[12px] text-slate-500 mt-0.5">视频导出的清晰度</span>
            </div>
            <select
              value={settings.general.resolution}
              onChange={(e) => {
                const val = e.target.value as 'original' | '1080P'
                updateSettings('general', { resolution: val })
                setSetting('general.resolution', val)
              }}
              className="bg-white border border-slate-200 rounded px-2.5 py-1.5 text-[13px] font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="original">原始分辨率 (Native)</option>
              <option value="1080P">1080P HD</option>
            </select>
          </div>
        </div>
      </div>

      {/* 模块 2：窗口行为 */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3 ml-1">窗口行为</h2>
        
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
          {/* 最小化到托盘 */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-slate-800">关闭主面板时最小化到系统托盘</span>
              <span className="text-[12px] text-slate-500 mt-0.5">保持应用在后台静默运行</span>
            </div>
            <button
              onClick={() => {
                const newValue = !settings.general.minimizeToTrayOnClose
                updateSettings('general', { minimizeToTrayOnClose: newValue })
                setSetting('general.minimizeToTrayOnClose', newValue)
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                settings.general.minimizeToTrayOnClose ? 'bg-blue-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                  settings.general.minimizeToTrayOnClose ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### 4.2 快捷键设置（Shortcuts.tsx）

```tsx
// src/settings/pages/Shortcuts.tsx
import { useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { Pause, Eye, Disc, Info } from 'lucide-react'

export function Shortcuts() {
  const { settings, updateSettings, setSetting } = useSettings()
  const [activeInput, setActiveInput] = useState<string | null>(null)

  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    e.preventDefault()
    
    const modifiers: string[] = []
    if (e.ctrlKey || e.metaKey) modifiers.push('CmdOrCtrl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')
    
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

    const mainKey = e.key.length === 1 ? e.key.toUpperCase() : e.key
    const shortcut = [...modifiers, mainKey].join('+')
    
    updateSettings('shortcuts', { [key]: shortcut })
    setSetting(`shortcuts.${key}`, shortcut)
    setActiveInput(null)
  }

  const shortcutItems = [
    { label: '开始 / 停止录制', key: 'toggleRecord', description: '按此快捷键立即开始全屏录制，再按停止', icon: Disc },
    { label: '暂停 / 恢复录制', key: 'togglePause', description: '录制过程中随时暂停或继续，不限录制模式', icon: Pause },
    { label: '唤出 / 隐藏工具条', key: 'toggleVisibility', description: '全局隐藏或显示屏幕顶部��录��悬浮工具条', icon: Eye },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3 ml-1">全局快捷键</h2>
        
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
          {shortcutItems.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.key} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded bg-slate-50 border border-slate-100 text-slate-500 shrink-0">
                    <Icon className="w-[14px] h-[14px]" strokeWidth={2} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-slate-800">{item.label}</span>
                    <span className="text-[12px] text-slate-500 mt-0.5">{item.description}</span>
                  </div>
                </div>
                
                <div className="relative shrink-0 ml-4">
                  <button
                    onClick={() => setActiveInput(item.key)}
                    onKeyDown={(e) => activeInput === item.key && handleKeyDown(e, item.key)}
                    className={`min-w-[130px] px-3 py-1.5 rounded border text-center text-[12px] font-mono transition-all outline-none ${
                      activeInput === item.key
                        ? 'border-blue-500 bg-blue-50 text-blue-600 ring-1 ring-blue-500'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus:border-slate-300'
                    }`}
                  >
                    {activeInput === item.key ? '等待按键...' : (settings.shortcuts as Record<string, string>)[item.key]}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        
        <div className="flex items-start gap-2 mt-3 ml-1">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-[2px]" />
          <p className="text-[12px] text-slate-500 leading-relaxed">
            建议使用组合键（如包含 Alt、Ctrl 或 Shift）作为快捷键，以防与系统或其他软件发生冲突。
          </p>
        </div>
      </div>
    </div>
  )
}
```

### 4.3 存储设置（Recordings.tsx）

```tsx
// src/settings/pages/Recordings.tsx
import { useState, useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import { Folder, ExternalLink, Trash2, FolderOpen, CheckSquare, Square, HelpCircle } from 'lucide-react'

export function Recordings() {
  const { settings, updateSettings, setSetting } = useSettings()
  const [recordings, setRecordings] = useState<{ id: string; name: string; path: string; size: number; sizeFormatted: string; date: string }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showTemplateHint, setShowTemplateHint] = useState(false)
  const [appName, setAppName] = useState('ZapRec')

  useEffect(() => {
    loadRecordings()
    ;(window.caplet as any).getAppName().then((name: string) => {
      if (name) setAppName(name)
    })
  }, [settings.storage.saveDirectory])

  const loadRecordings = async () => {
    if (!settings.storage.saveDirectory) {
      setLoading(false)
      return
    }
    setLoading(true)
    const items = await (window.caplet as any).getRecordings(settings.storage.saveDirectory)
    setRecordings(items || [])
    setLoading(false)
  }

  const handleChangeDirectory = async () => {
    const newPath = await (window.caplet as any).selectDirectory()
    if (newPath) {
      updateSettings('storage', { saveDirectory: newPath })
      setSetting('storage.saveDirectory', newPath)
    }
  }

  const handleOpenFolder = () => {
    if (settings.storage.saveDirectory) {
      ;(window.caplet as any).openInFolder(settings.storage.saveDirectory)
    }
  }

  const currentTemplate = (settings.storage as Record<string, string>).filenameTemplate || '{app}_{date}_{time}'

  return (
    <div className="space-y-6">
      {/* 模块 1：存储位置 */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3 ml-1">存储位置</h2>
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col min-w-0 mr-4">
              <span className="text-[13px] font-medium text-slate-800">当前保存路径</span>
              <span className="text-[12px] text-slate-500 truncate mt-0.5 font-mono">
                {settings.storage.saveDirectory || '未设置'}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={handleChangeDirectory} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[12px] font-medium rounded hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" /> 更改
              </button>
              <button onClick={handleOpenFolder} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[12px] font-medium rounded hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> 打开
              </button>
            </div>
          </div>
          
          <div className="flex flex-col border-t border-slate-100">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-slate-800">文件命名</span>
                <span className="text-[12px] text-slate-500 mt-0.5">自定义录制文件的命名规则</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={currentTemplate}
                  onChange={(e) => {
                    updateSettings('storage', { filenameTemplate: e.target.value })
                    setSetting('storage.filenameTemplate', e.target.value)
                  }}
                  className="w-48 px-2.5 py-1.5 text-[12px] text-slate-700 font-mono border border-slate-200 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="{app}_{date}_{time}"
                />
                <button onClick={() => setShowTemplateHint(!showTemplateHint)} className={`p-1.5 rounded transition-colors ${showTemplateHint ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                  <HelpCircle className="w-[15px] h-[15px]" />
                </button>
              </div>
            </div>
            {showTemplateHint && (
              <div className="px-4 pb-4 pt-1 bg-slate-50/60 border-t border-slate-100/50">
                <p className="text-[12px] text-slate-600 font-medium mb-2">支持的变量说明：</p>
                <ul className="text-[12px] text-slate-500 space-y-1.5 font-mono ml-1">
                  <li><span className="inline-block w-[50px] text-blue-600 font-medium">{`{app}`}</span> - 软件名称</li>
                  <li><span className="inline-block w-[50px] text-blue-600 font-medium">{`{date}`}</span> - 录制日期</li>
                  <li><span className="inline-block w-[50px] text-blue-600 font-medium">{`{time}`}</span> - 录制时间</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 模块 2：录屏列表（代码省略，参考原文件） */}
      {/* ... */}
    </div>
  )
}
```

## 5. Toolbar 加载 lastState

```tsx
// src/components/Toolbar.tsx

useEffect(() => {
  // 加载上次的麦克风、系统音频、画中画状态
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

// 保存 lastState
const setMicrophoneEnabled = (enabled: boolean) => {
  useAppStore.getState().setMicrophoneEnabled(enabled)
  ;(window.caplet as any).settingsSet('lastState.microphoneEnabled', enabled)
}

const setSystemAudioEnabled = (enabled: boolean) => {
  useAppStore.getState().setSystemAudioEnabled(enabled)
  ;(window.caplet as any).settingsSet('lastState.systemAudioEnabled', enabled)
}

const setPipEnabled = (enabled: boolean) => {
  useAppStore.getState().setPipEnabled(enabled)
  ;(window.caplet as any).settingsSet('lastState.pipEnabled', enabled)
}
```

## 6. 数据流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        设置面板                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  General.tsx    │  Shortcuts.tsx   │  Recordings.tsx                  │
│  - countdown    │  - toggleRecord│  - saveDirectory                │
│  - fps          │  - togglePause  │  - filenameTemplate             │
│  - resolution   │  - toggleVisibility                               │
│  - minimizeTray │                  │                                 │
└────────┬────────────────┬─────────────────────────────┬──────────────┘
         │                │                             │
         │ setSetting()   │                             │
         ↓                ↓                             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                     useSettings Hook                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  settingsSet(key, value)                                             │
│         ↓                                                            │
│  window.caplet.settingsSet(key, value)   // preload               │
│         ↓                                                            │
│  ipcRenderer.invoke('settings-set', key, value)                   │
└────────┬───────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                       主进程                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ipcMain.handle('settings-set', (_, key, value)                    │
│         ↓                                                            │
│  settingsData[key] = value                                          │
│         ↓                                                            │
│  saveSettings() → 写入 settings.json                                │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ 读取
         ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                     运行逻辑                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Toolbar: settingsLoad() → lastState (mic/systemAudio/pip)          │
│  App.tsx: startCountdown() → countdownSeconds                     │
│  App.tsx: startRecording() → fps, resolution, outputDirectory    │
│  Main: registerShortcuts() → globalShortcut                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## 7. 设置项使用对照表

| 设置项 | 设置路径 | 使用位置 | 用途 |
|--------|----------|----------|------|
| countdownSeconds | `general.countdownSeconds` | App.tsx / useRecordingCountdown | 录制倒计时 |
| fps | `general.fps` | App.tsx startRecording() | 视频帧率 |
| resolution | `general.resolution` | App.tsx startRecording() | 视频分辨率 |
| minimizeToTrayOnClose | `general.minimizeToTrayOnClose` | main/index.ts | 关闭行为 |
| toggleRecord | `shortcuts.toggleRecord` | main/index.ts registerShortcuts() | 全局快捷键 |
| togglePause | `shortcuts.togglePause` | main/index.ts registerShortcuts() | 全局快捷键 |
| toggleVisibility | `shortcuts.toggleVisibility` | main/index.ts registerShortcuts() | 全局快捷键 |
| saveDirectory | `storage.saveDirectory` | App.tsx startRecording() | 文件保存目录 |
| filenameTemplate | `storage.filenameTemplate` | App.tsx startRecording() | 文件命名规则 |
| microphoneEnabled | `lastState.microphoneEnabled` | Toolbar.tsx | 麦克风开关状态 |
| systemAudioEnabled | `lastState.systemAudioEnabled` | Toolbar.tsx | 系统音频开关状态 |
| pipEnabled | `lastState.pipEnabled` | Toolbar.tsx | 画中画开关状态 |