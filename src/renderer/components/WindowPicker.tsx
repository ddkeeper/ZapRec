import { useState, useEffect, useCallback } from 'react'
import type { DesktopSource } from '../types'
import { LayoutGrid } from 'lucide-react'

const COLORS = {
  bgDeep: '#11181A',
  bgCard: '#1A2628',
  text: '#F5F9F9',
  textMuted: '#6B8A8C',
  accent: '#478A8F',
  borderSubtle: 'rgba(71, 138, 143, 0.25)',
}

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
      console.log('[WindowPicker] loadWindows: getting sources...')
      const sources = await window.screenApi.getSources(['window'])
      console.log('[WindowPicker] loadWindows: got', sources.length, 'windows')
      setWindows(sources as DesktopSource[])
    } catch (error) {
      console.error('[WindowPicker] Failed to load windows:', error)
    }
    setLoading(false)
  }

  const handleSelect = useCallback((window: DesktopSource) => {
    console.log('[WindowPicker] handleSelect called:', window.name)
    onSelect(window)
  }, [onSelect])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    console.log('[WindowPicker] handleKeyDown:', e.key)
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
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* 顶部提示 */}
      <div className="fixed top-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm flex gap-6"
        style={{ 
          backgroundColor: COLORS.bgCard, 
          border: `2px solid ${COLORS.borderSubtle}`, 
          color: COLORS.text,
          backdropFilter: 'blur(10px)', 
          zIndex: 10001 
        }}>
        <span className="flex items-center gap-2"><LayoutGrid size={16} /> 选择要录制的窗口</span>
        <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded">Esc</kbd> 取消</span>
      </div>

      {/* 窗口选择对话框 */}
      <div
        className="w-[800px] h-[50vh] min-h-[400px] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{
          backgroundColor: COLORS.bgDeep,
          border: `1px solid ${COLORS.borderSubtle}`,
        }}
      >
        <div className="p-4 overflow-y-auto flex-1 bg-black/10">
          {loading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: COLORS.accent, borderTopColor: 'transparent' }} />
              <span className="text-sm" style={{ color: COLORS.textMuted }}>正在获取桌面窗口...</span>
            </div>
          ) : windows.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <span className="text-sm" style={{ color: COLORS.textMuted }}>未检测到可录制的窗口（最小化的窗口无法录制）</span>
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
                    backgroundColor: COLORS.bgCard,
                    border: hoveredWindow === win.id 
                      ? `2px solid ${COLORS.accent}` 
                      : `2px solid ${COLORS.borderSubtle}`,
                    boxShadow: hoveredWindow === win.id ? '0 4px 12px rgba(71, 138, 143, 0.15)' : 'none',
                    transform: hoveredWindow === win.id ? 'translateY(-2px)' : 'none',
                  }}
                >
                  <div className="relative aspect-video w-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <img
                      src={win.thumbnail}
                      alt="thumbnail"
                      className="w-full h-full object-contain"
                      draggable={false}
                      onError={(e) => (e.currentTarget.style.display = 'none')} 
                    />
                    {hoveredWindow === win.id && (
                      <div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm transition-all" style={{ backgroundColor: 'rgba(71, 138, 143, 0.15)' }}>
                        <div className="px-4 py-1.5 rounded-full shadow-lg" style={{ backgroundColor: COLORS.accent }}>
                          <span className="text-white text-sm font-medium">点击录制</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex items-center gap-3 w-full" style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderTop: `1px solid ${COLORS.borderSubtle}` }}>
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
                      className="text-sm font-medium truncate flex-1"
                      style={{ color: COLORS.text }}
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
