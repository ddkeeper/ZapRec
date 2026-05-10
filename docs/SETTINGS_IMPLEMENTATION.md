# ZapRec 设置项实现文档

## 一、设置数据结构

### 1.1 主进程配置存储 (src/main/index.ts)

```typescript
let store: Record<string, Record<string, unknown>> = {
  storage: {
    saveDirectory: app.getPath('downloads'),
    filenameTemplate: '{app}_{date}_{time}'
  },
  video: {
    format: 'mp4',
    quality: 'high',
    frameRate: 30,
    codec: 'h264'
  },
  general: {
    countdownSeconds: 3,
    fps: 30,
    resolution: 'original',
    minimizeToTrayOnClose: true
  }
}
```

### 1.2 设置类型定义 (src/settings/types.ts)

```typescript
export interface GeneralSettings {
  countdownSeconds: number
  fps: 30 | 60
  resolution: 'original' | '1080P'
  minimizeToTrayOnClose: boolean
}

export interface StorageSettings {
  saveDirectory: string
  filenameTemplate: string
}
```

---

## 二、视频帧率 (FPS)

### 2.1 设置界面 (src/settings/pages/General.tsx:38-65)

```tsx
{/* 列表项：视频帧率 */}
<div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
  <div className="flex flex-col">
    <span className="text-[13px] font-medium text-slate-800">视频帧率</span>
    <span className="text-[12px] text-slate-500 mt-0.5">选择录制视频的流畅度</span>
  </div>
  <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200">
    {[30, 60].map((fps) => {
      const isActive = settings.general.fps === fps
      return (
        <button
          key={fps}
          onClick={() => {
            updateSettings('general', { fps: fps as 30 | 60 })
            setSetting('general.fps', fps)
          }}
        >
          {fps} FPS
        </button>
      )
    })}
  </div>
</div>
```

### 2.2 质量预设 (src/shared/types.ts:54-58)

```typescript
export const QUALITY_PRESETS = {
  '720p': { width: 1280, height: 720, fps: 30 },
  '1080p': { width: 1920, height: 1080, fps: 30 },
  '1080p60': { width: 1920, height: 1080, fps: 60 }
}
```

### 2.3 录制时应用帧率 (src/App.tsx:76-84)

```typescript
// 根据 FPS 设置选择对应的质量预设
const fps = general.fps as number
let quality: '720p' | '1080p' | '1080p60' = '1080p'
if (fps === 30) {
  quality = '1080p'
} else if (fps === 60) {
  quality = '1080p60'
}
store.setSettings({ quality, countdown: countdown || 3 })
```

在 MediaRecorder 初始化时应用：
```typescript
// src/App.tsx:304
{ width: recordingWidth, height: recordingHeight, fps: quality.fps }
```

---

## 三、录制分辨率

### 3.1 设置界面 (src/settings/pages/General.tsx:67-85)

```tsx
{/* 列表项：录制分辨率 */}
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
  >
    <option value="original">原始分辨率 (Native)</option>
    <option value="1080P">1080P HD</option>
  </select>
</div>
```

### 3.2 录制时应用分辨率 (src/App.tsx:168-250)

```typescript
// 获取质量预设的尺寸
const quality = QUALITY_PRESETS[currentSettings.quality]
let recordingWidth = quality.width
let recordingHeight = quality.height

// 根据设置决定是否使用原始分辨率
if (general.resolution === 'original') {
  // 使用屏幕实际分辨率
  recordingWidth = realSize.width
  recordingHeight = realSize.height
}

// 确保尺寸为偶数（某些编码器要求）
if (recordingWidth % 2 !== 0) recordingWidth--
if (recordingHeight % 2 !== 0) recordingHeight--
```

---

## 四、文件命名模板

### 4.1 设置界面 (src/settings/pages/Recordings.tsx:127-185)

```tsx
{/* 命名模板配置 */}
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
      placeholder="{app}_{date}_{time}"
    />
  </div>
</div>

{/* 模板变量提示 */}
{showTemplateHint && (
  <div>
    <p>支持的变量说明：</p>
    <ul>
      <li>{app} - 应用名（默认 ZapRec）</li>
      <li>{date} - 日期（格式: YYYY-MM-DD）</li>
      <li>{time} - 时间（格式: HH-MM-SS）</li>
    </ul>
    {/* 动态预览 */}
    <div className="preview">
      预览: {previewFilename}
    </div>
  </div>
)}
```

### 4.2 文件名生成逻辑 (src/App.tsx:21-35)

```typescript
const generateDynamicPath = (outputDir: string, segmentIndex?: number) => {
  const settings = useAppStore.getState().settings
  const template = settings?.filenameTemplate || '{app}_{date}_{time}'
  const now = new Date()
  const date = now.toISOString().split('T')[0]
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-')
  const baseName = template
    .replace(/{app}/g, 'ZapRec')
    .replace(/{date}/g, date)
    .replace(/{time}/g, time)
  const finalName = segmentIndex !== undefined 
    ? `${baseName}_seg${segmentIndex}.mp4` 
    : `${baseName}.mp4`
  return `${outputDir}/${finalName}`
}
```

**示例输出**：
- 模板: `{app}_{date}_{time}`
- 输出: `ZapRec_2026-05-02_14-30-05.mp4`

### 4.3 状态同步 (src/store/useAppStore.ts:117-121)

```typescript
// 同步 filenameTemplate
if (storage.filenameTemplate !== undefined) {
  newSettings.filenameTemplate = storage.filenameTemplate as string
}
```

---

## 五、设置持久化

### 5.1 保存设置 (src/main/index.ts)

```typescript
function saveSettings() {
  const configPath = path.join(app.getPath('userData'), 'config.json')
  try {
    fs.writeFileSync(configPath, JSON.stringify(store, null, 2))
  } catch (err) {
    console.error('[Main] Failed to save settings:', err)
  }
}
```

### 5.2 加载设置 (src/main/index.ts)

```typescript
function loadSettings() {
  const configPath = path.join(app.getPath('userData'), 'config.json')
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      store = { ...store, ...data }
    }
  } catch (err) {
    console.error('[Main] Failed to load settings:', err)
  }
}
```

### 5.3 IPC 处理 (src/main/index.ts)

```typescript
ipcMain.handle('settings-set', (_, key: string, value: unknown) => {
  setSetting(key, value)
  saveSettings()
  // 广播给所有窗口
  const latestSettings = getSettings()
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('settings-sync', latestSettings)
    }
  })
})
```

---

## 六、相关文件索引

| 文件 | 职责 |
|------|------|
| src/main/index.ts | 配置存储、持久化、IPC 处理 |
| src/settings/pages/General.tsx | 帧率、分辨率 UI |
| src/settings/pages/Recordings.tsx | 文件命名模板 UI |
| src/settings/types.ts | 设置类型定义 |
| src/settings/hooks/useSettings.ts | 设置 Hook |
| src/store/useAppStore.ts | 状态同步逻辑 |
| src/shared/types.ts | QUALITY_PRESETS 定义 |
| src/App.tsx | 录制时读取和应用设置 |

---

## 七、数据流向

```
用户修改设置
    ↓
General.tsx / Recordings.tsx
    ↓
setSetting('key', value) → IPC
    ↓
main/index.ts settings-set
    ↓
setSetting() + saveSettings()
    ↓
广播 settings-sync 到所有窗口
    ↓
App.tsx / useAppStore 接收并更新状态
    ↓
录制时读取 settings 应用到录制参数
```