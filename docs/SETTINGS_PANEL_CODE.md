# 设置面板 UI 代码文档

本文档包含设置面板的所有 UI 相关代码。

---

## 1. SettingsLayout.tsx (主布局)

```tsx
import { useState, useEffect } from 'react'
import { General } from '../pages/General'
import { Shortcuts } from '../pages/Shortcuts'
import { Recordings } from '../pages/Recordings'
import { Settings, Keyboard, Film, Minus, Square, X } from 'lucide-react'
import { AppIcon } from '@/components/AppIcon'

type TabKey = 'general' | 'shortcuts' | 'recordings'

const tabs: { id: TabKey; label: string; icon: typeof Settings }[] = [
  { id: 'general', label: '通用', icon: Settings },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'recordings', label: '录屏管理', icon: Film },
]

export function SettingsLayout() {
  const [activeTab, setActiveTab] = useState<TabKey>('general')

  useEffect(() => {
    const caplet = window.caplet as { onNavigateTab?: (callback: (tabId: string) => void) => () => void }
    const unlisten = caplet.onNavigateTab?.((tabId: string) => {
      if (tabId === 'general' || tabId === 'shortcuts' || tabId === 'recordings') {
        setActiveTab(tabId)
      }
    })
    return () => unlisten?.()
  }, [])

  // 窗口控制逻辑 (调用 Electron 暴露的 API)
  const handleMinimize = () => (window.caplet as any).settingsWindowMinimize?.()
  const handleMaximize = () => (window.caplet as any).windowMaximize?.()
  const handleClose = () => (window.caplet as any).closeSettings?.()

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <General />
      case 'shortcuts':
        return <Shortcuts />
      case 'recordings':
        return <Recordings />
      default:
        return <General />
    }
  }

  return (
    <>
      {/* 极简浅色滚动条样式 */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1; /* slate-300 */
          border-radius: 10px;
          border: 2px solid #ffffff; /* 创造悬浮感 */
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8; /* slate-400 */
        }
      `}</style>

      {/* 根容器：纯白背景，深灰字体，边框防止与系统背景融合 */}
      <div className="flex flex-col h-screen bg-white text-slate-800 font-sans overflow-hidden border border-slate-200 shadow-2xl">
        
        {/* 1. 顶部标准标题栏 (Title Bar) */}
        <div 
          className="h-10 flex items-center justify-between pl-4 select-none bg-white shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {/* 左侧：Logo 与 标题 */}
          <div className="flex items-center gap-2">
            <AppIcon size={28} />
            <span className="text-xs font-medium text-slate-600 tracking-wide">设置</span>
          </div>

          {/* 右侧：窗口控制三大金刚键 */}
          <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button 
              onClick={handleMinimize}
              className="px-4 hover:bg-slate-100 text-slate-500 transition-colors"
              title="最小化"
            >
              <Minus className="w-[15px] h-[15px]" strokeWidth={2} />
            </button>
            <button 
              onClick={handleMaximize}
              className="px-4 hover:bg-slate-100 text-slate-500 transition-colors"
              title="最大化"
            >
              <Square className="w-[13px] h-[13px]" strokeWidth={2} />
            </button>
            <button 
              onClick={handleClose}
              className="px-4 hover:bg-red-500 hover:text-white text-slate-500 transition-colors"
              title="关闭"
            >
              <X className="w-[15px] h-[15px]" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* 2. 主体区域 (侧边栏 + 右侧内容) */}
        <div className="flex flex-1 overflow-hidden border-t border-slate-100">
          
          {/* 左侧边栏：极浅灰底色 */}
          <div className="w-[180px] bg-[#f8fafc] flex flex-col border-r border-slate-200 shrink-0">
            {/* 导航菜单 */}
            <nav className="p-3 space-y-0.5">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                      isActive
                        ? 'bg-[#e2e8f0] text-slate-900 font-medium' // 选中态：浅灰底，深色字
                        : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-[15px] h-[15px]" strokeWidth={isActive ? 2.5 : 2} />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </nav>

            {/* 底部版本号 */}
            <div className="mt-auto px-6 py-4 select-none">
              <span className="text-[11px] font-medium text-slate-400 tracking-wider">V1.3.824</span>
            </div>
          </div>

          {/* 右侧设置详情区 */}
          <div className="flex-1 bg-white overflow-hidden custom-scrollbar">
            {/* 限制最大宽度，让设置项看起来紧凑精致 */}
            <div className="max-w-[600px] h-full overflow-y-auto custom-scrollbar p-8"> 
              {renderContent()}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
```

---

## 2. General.tsx (通用设置页面)

```tsx
import { useSettings } from '../hooks/useSettings'

export function General() {
  const { settings, updateSettings, setSetting } = useSettings()

  return (
    <div className="space-y-6">
      
      {/* 模块 1：录制设置 */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3 ml-1">录制设置</h2>
        
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
          
          {/* 列表项：录制倒计时 */}
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
                    className={`px-3 py-1 text-[12px] font-medium rounded-sm transition-all ${
                      isActive
                        ? 'bg-white shadow-sm text-slate-800 border border-slate-200/50'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {fps} FPS
                  </button>
                )
              })}
            </div>
          </div>

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
          {/* 列表项：最小化到托盘 */}
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

---

## 3. Shortcuts.tsx (快捷键设置页面)

```tsx
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

  // 引入 description 字段，实现就近说明
  const shortcutItems = [
    { 
      label: '开始 / 停止录制', 
      key: 'toggleRecord', 
      description: '按此快捷键立即开始全屏录制，再按停止',
      icon: Disc 
    },
    { 
      label: '暂停 / 恢复录制', 
      key: 'togglePause', 
      description: '录制过程中随时暂停或继续，不限录制模式',
      icon: Pause 
    },
    { 
      label: '唤出 / 隐藏工具条', 
      key: 'toggleVisibility', 
      description: '全局隐藏或显示屏幕顶部的录制悬浮工具条',
      icon: Eye 
    },
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
                  {/* 极简中性图标样式 */}
                  <div className="flex items-center justify-center w-7 h-7 rounded bg-slate-50 border border-slate-100 text-slate-500 shrink-0">
                    <Icon className="w-[14px] h-[14px]" strokeWidth={2} />
                  </div>
                  
                  {/* 标题与描述的纵向紧凑布局 */}
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
        
        {/* 底部提示仅保留通用防冲突建议 */}
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

---

## 4. Recordings.tsx (录屏管理页面)

```tsx
import { useState, useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import { Folder, ExternalLink, Trash2, FolderOpen, CheckSquare, Square, Film, FolderSearch, HelpCircle } from 'lucide-react'

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

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (selectedIds.size === recordings.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(recordings.map(r => r.id)))
    }
  }

  const deleteRecording = async (id: string) => {
    const rec = recordings.find(r => r.id === id)
    if (!rec) return
    await (window.caplet as any).deleteRecordings([rec.path])
    setRecordings(prev => prev.filter(r => r.id !== id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const deleteSelected = async () => {
    const paths = recordings
      .filter(r => selectedIds.has(r.id))
      .map(r => r.path)
    await (window.caplet as any).deleteRecordings(paths)
    setRecordings(prev => prev.filter(r => !selectedIds.has(r.id)))
    setSelectedIds(new Set())
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

  const handleOpenInFolder = (path: string) => {
    ;(window.caplet as any).openInFolder(path)
  }

  // 动态模板预览逻辑
  const currentTemplate = (settings.storage as Record<string, string>).filenameTemplate || '{app}_{date}_{time}'
  const previewFilename = currentTemplate
    .replace(/{app}/g, appName)
    .replace(/{date}/g, '2026-04-28')
    .replace(/{time}/g, '14-30-05')
    + '.mp4'

  return (
    <div className="space-y-6">
      
      {/* 模块 1：存储位置 */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3 ml-1">存储位置</h2>
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
          
          {/* 路径配置 */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col min-w-0 mr-4">
              <span className="text-[13px] font-medium text-slate-800">当前保存路径</span>
              <span className="text-[12px] text-slate-500 truncate mt-0.5 font-mono">
                {settings.storage.saveDirectory || '未设置'}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button 
                onClick={handleChangeDirectory}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[12px] font-medium rounded hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                更改
              </button>
              <button 
                onClick={handleOpenFolder}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[12px] font-medium rounded hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                打开
              </button>
            </div>
          </div>
          
          {/* 命名模板配置 */}
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
                <button
                  onClick={() => setShowTemplateHint(!showTemplateHint)}
                  className={`p-1.5 rounded transition-colors ${showTemplateHint ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                  title="如何配置模板？"
                >
                  <HelpCircle className="w-[15px] h-[15px]" />
                </button>
              </div>
            </div>
            
            {/* 折叠的模板变量提示说明与动态预览 */}
            {showTemplateHint && (
              <div className="px-4 pb-4 pt-1 bg-slate-50/60 border-t border-slate-100/50">
                <p className="text-[12px] text-slate-600 font-medium mb-2">支持的变量说明：</p>
                <ul className="text-[12px] text-slate-500 space-y-1.5 font-mono ml-1">
                  <li><span className="inline-block w-[50px] text-blue-600 font-medium">{`{app}`}</span> - 软件名称 (如: {appName})</li>
                  <li><span className="inline-block w-[50px] text-blue-600 font-medium">{`{date}`}</span> - 录制日期 (如: 2026-04-28)</li>
                  <li><span className="inline-block w-[50px] text-blue-600 font-medium">{`{time}`}</span> - 录制时间 (如: 14-30-05)</li>
                </ul>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60">
                  <span className="text-[11px] text-slate-400">当前示例:</span>
                  <span className="text-[12px] font-mono text-slate-700 font-medium bg-white px-2 py-0.5 rounded border border-slate-200 shadow-sm">
                    {previewFilename}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 模块 2：录屏列表 */}
      <div className="flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3 ml-1 shrink-0">
          <h2 className="text-sm font-semibold text-slate-800">录屏管理</h2>
          
          {selectedIds.size > 0 && (
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium text-red-600 hover:bg-red-50 rounded transition-colors border border-red-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
              批量删除 ({selectedIds.size})
            </button>
          )}
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm flex flex-col min-h-[200px]">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-slate-50/80 border-b border-slate-200 shrink-0">
              <tr>
                <th className="py-2 px-3 w-10 text-center">
                  <button onClick={toggleAll} className="text-slate-400 hover:text-blue-500 transition-colors mt-1">
                    {selectedIds.size === recordings.length && recordings.length > 0 ? <CheckSquare className="w-[15px] h-[15px] text-blue-500" /> : <Square className="w-[15px] h-[15px]" />}
                  </button>
                </th>
                <th className="py-2 px-3 text-[12px] font-medium text-slate-500 w-auto">文件名</th>
                <th className="py-2 px-3 text-[12px] font-medium text-slate-500 w-[70px]">大小</th>
                <th className="py-2 px-3 text-[12px] font-medium text-slate-500 w-[130px]">日期</th>
                <th className="py-2 px-3 w-[70px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 overflow-y-auto flex-1">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    <FolderSearch className="w-6 h-6 mx-auto mb-2 text-slate-300" strokeWidth={1.5} />
                    <p className="text-[13px]">加载中...</p>
                  </td>
                </tr>
              ) : recordings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    <Film className="w-6 h-6 mx-auto mb-2 text-slate-300" strokeWidth={1.5} />
                    <p className="text-[13px]">暂无录屏记录</p>
                    <p className="text-[12px] text-slate-400 mt-1">录制完成后生成的文件将显示在这里</p>
                  </td>
                </tr>
              ) : (
                recordings.map((rec) => (
                  <tr 
                    key={rec.id} 
                    className={`hover:bg-slate-50 transition-colors ${selectedIds.has(rec.id) ? 'bg-blue-50/40' : ''}`}
                  >
                    <td className="py-2.5 px-3 text-center">
                      <button onClick={() => toggleSelect(rec.id)} className="text-slate-400 hover:text-blue-500 transition-colors mt-0.5">
                        {selectedIds.has(rec.id) ? <CheckSquare className="w-[15px] h-[15px] text-blue-500" /> : <Square className="w-[15px] h-[15px]" />}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-[13px] font-medium text-slate-700 truncate max-w-[160px]" title={rec.name}>{rec.name}</td>
                    <td className="py-2.5 px-3 text-[12px] text-slate-500 whitespace-nowrap">{rec.sizeFormatted}</td>
                    <td className="py-2.5 px-3 text-[12px] text-slate-500 whitespace-nowrap">{rec.date}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <button 
                          onClick={() => handleOpenInFolder(rec.path)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                          title="在文件夹中显示"
                        >
                          <Folder className="w-[15px] h-[15px]" />
                        </button>
                        <button 
                          onClick={() => deleteRecording(rec.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-[15px] h-[15px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

---

## 5. settings.html (HTML 入口)

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ZapRec - 设置</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #0f172a;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/settings/main.tsx"></script>
  </body>
</html>
```

---

## 6. 文件结构

```
src/settings/
├── main.tsx           # Settings 入口
├── types.ts           # 类型定义
├── hooks/
│   └── useSettings.ts # Settings hook
├── components/
│   └── SettingsLayout.tsx  # 主布局组件
└── pages/
    ├── General.tsx     # 通用设置
    ├── Shortcuts.tsx  # 快捷键设置
    └── Recordings.tsx # 录屏管理
```