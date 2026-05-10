import { useState, useEffect } from 'react'
import { General } from '../pages/General'
import { Shortcuts } from '../pages/Shortcuts'
import { Recordings } from '../pages/Recordings'
import { Settings, Keyboard, Film, Minus, Square, X } from 'lucide-react'
import { AppIcon } from '../../renderer/components/AppIcon'

type TabKey = 'general' | 'shortcuts' | 'recordings'

const tabs: { id: TabKey; label: string; icon: typeof Settings }[] = [
  { id: 'general', label: '通用', icon: Settings },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'recordings', label: '录屏管理', icon: Film },
]

export function SettingsLayout() {
  const [activeTab, setActiveTab] = useState<TabKey>('general')

  useEffect(() => {
    const caplet = window.screenApi as { onNavigateTab?: (callback: (tabId: string) => void) => () => void }
    const unlisten = caplet.onNavigateTab?.((tabId: string) => {
      if (tabId === 'general' || tabId === 'shortcuts' || tabId === 'recordings') {
        setActiveTab(tabId)
      }
    })
    return () => unlisten?.()
  }, [])

  // 窗口控制逻辑 (调用 Electron 暴露的 API)
  const handleMinimize = () => (window.screenApi as any).settingsWindowMinimize?.()
  const handleMaximize = () => (window.screenApi as any).windowMaximize?.()
  const handleClose = () => (window.screenApi as any).closeSettings?.()

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
            {/* 使用 w-full 撑满，max-w-4xl 限制极限宽度，mx-auto 保证超大窗口时居中 */}
            <div className="w-full max-w-4xl mx-auto h-full overflow-y-auto custom-scrollbar p-8 pr-12"> 
              {renderContent()}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}