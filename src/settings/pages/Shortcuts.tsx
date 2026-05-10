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