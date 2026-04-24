import { useState, useEffect, useCallback } from 'react'
import type { DesktopSource } from '../shared/types'
import { LayoutGrid } from 'lucide-react'

interface WindowPickerProps {
  onSelect: (window: DesktopSource) => void
  onCancel: () => void
}

export default function WindowPicker({ onSelect, onCancel }: WindowPickerProps) {
  const [windows, setWindows] = useState<DesktopSource[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredWindow, setHoveredWindow] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      loadWindows()
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  const loadWindows = async () => {
    setLoading(true)
    try {
      const sources = await window.caplet.getSources(['window'])
      setWindows(sources)
    } catch (error) {
      console.error('[WindowPicker] Failed to load windows:', error)
    }
    setLoading(false)
  }

  const handleSelect = useCallback((window: DesktopSource) => {
    onSelect(window)
  }, [onSelect])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }, [onCancel])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* 顶部提示 */}
      <div className="fixed top-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm text-white flex gap-6"
        style={{ backgroundColor: 'rgba(30, 30, 30, 0.92)', border: '2px solid rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(10px)', zIndex: 10001 }}>
        <span className="flex items-center gap-2"><LayoutGrid size={16} /> 选择要录制的窗口</span>
        <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded">Esc</kbd> 取消</span>
      </div>

      {/* 窗口选择对话框 */}
      <div
        className="w-[800px] h-[50vh] min-h-[400px] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{
          backgroundColor: 'rgba(28, 28, 30, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="p-4 overflow-y-auto flex-1 bg-black/20">
          {loading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-zinc-500 text-sm">正在获取桌面窗口...</span>
            </div>
          ) : windows.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <span className="text-zinc-500 text-sm">未检测到可录制的窗口（最小化的窗口无法录制）</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {windows.map((win) => (
                <button
                  key={win.id}
                  onClick={() => handleSelect(win)}
                  onMouseEnter={() => setHoveredWindow(win.id)}
                  onMouseLeave={() => setHoveredWindow(null)}
                  className="group relative flex flex-col rounded-xl overflow-hidden transition-all duration-200 text-left"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: hoveredWindow === win.id 
                      ? '2px solid #3b82f6' 
                      : '2px solid transparent',
                    boxShadow: hoveredWindow === win.id ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
                    transform: hoveredWindow === win.id ? 'translateY(-2px)' : 'none',
                  }}
                >
                  <div className="relative aspect-video bg-black/60 w-full overflow-hidden">
                    <img
                      src={win.thumbnail}
                      alt="thumbnail"
                      className="w-full h-full object-contain"
                      draggable={false}
                      onError={(e) => (e.currentTarget.style.display = 'none')} 
                    />
                    {hoveredWindow === win.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20 backdrop-blur-sm transition-all">
                        <div className="px-4 py-1.5 rounded-full bg-blue-600 shadow-lg">
                          <span className="text-white text-sm font-medium">点击录制</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex items-center gap-3 w-full border-t border-white/5 bg-white/[0.02]">
                    {win.appIcon ? (
                      <img
                        src={win.appIcon}
                        alt="icon"
                        className="w-5 h-5 rounded-sm shrink-0"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-sm bg-white/10 shrink-0" />
                    )}
                    <span 
                      className="text-zinc-300 text-sm font-medium truncate flex-1"
                      title={win.name}
                    >
                      {win.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
