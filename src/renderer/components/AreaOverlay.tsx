import { useState, useRef, useCallback, useEffect } from 'react'
import { SquareMousePointer } from 'lucide-react'

const COLORS = {
  bgCard: '#1A2628',
  text: '#F5F9F9',
  accent: '#478A8F',
  borderSubtle: 'rgba(71, 138, 143, 0.25)',
  maskOverlay: 'rgba(9, 15, 17, 0.6)',
  accentTranslucent: 'rgba(71, 138, 143, 0.15)',
  red: '#D35F5F',
}

export interface AreaSelection {
  x: number
  y: number
  height: number
  width: number
}

interface AreaOverlayProps {
  onConfirm: (area: AreaSelection) => void
  onCancel: () => void
}

export default function AreaOverlay({ onConfirm, onCancel }: AreaOverlayProps) {
  const [isSelecting, setIsSelecting] = useState(false)
  const [selection, setSelection] = useState<AreaSelection | null>(null)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [isRecordingVisuals, setIsRecordingVisuals] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unlisten = window.screenApi.onSwitchToRecordingVisuals(() => {
      setIsRecordingVisuals(true)
    })
    return () => unlisten()
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isRecordingVisuals) return
    setIsSelecting(true)
    setStartPoint({ x: e.clientX, y: e.clientY })
    setSelection(null)
  }, [isRecordingVisuals])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !startPoint) return
    const x = Math.min(startPoint.x, e.clientX)
    const y = Math.min(startPoint.y, e.clientY)
    const width = Math.abs(e.clientX - startPoint.x)
    const height = Math.abs(e.clientY - startPoint.y)
    setSelection({ x, y, width, height })
  }, [isSelecting, startPoint])

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isRecordingVisuals) return
    
    if (e.key === 'Enter' && selection && selection.width > 10 && selection.height > 10) {
      onConfirm(selection)
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }, [selection, onConfirm, onCancel, isRecordingVisuals])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-[9999] select-none ${isRecordingVisuals ? 'pointer-events-none' : ''}`}
      style={{
        WebkitAppRegion: 'no-drag',
        WebkitUserSelect: 'none',
      } as React.CSSProperties}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 阶段 1：区域选择阶段的遮罩层（全屏半透明 + 镂空） */}
      {!isRecordingVisuals && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="selection-mask">
              <rect width="100%" height="100%" fill="white" />
              {selection && (
                <rect
                  x={selection.x}
                  y={selection.y}
                  width={selection.width}
                  height={selection.height}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill={COLORS.maskOverlay} mask="url(#selection-mask)" />
        </svg>
      )}

      {/* 阶段 1：顶部提示栏 */}
      {!isRecordingVisuals && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm flex gap-6"
            style={{
              backgroundColor: COLORS.bgCard,
              border: `2px solid ${COLORS.borderSubtle}`,
              color: COLORS.text,
              backdropFilter: 'blur(10px)',
              zIndex: 10001,
            }}>
          <span className="flex items-center gap-2"><SquareMousePointer size={16} /> 拖拽选择录制区域</span>
          <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-xs">Enter</kbd> 确认</span>
          <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-xs">Esc</kbd> 取消</span>
        </div>
      )}

      {/* 阶段 1：正在拖拽时的选框 */}
      {!isRecordingVisuals && selection && (
        <div className="absolute border-2"
             style={{ 
               left: selection.x, 
               top: selection.y, 
               width: selection.width, 
               height: selection.height,
               borderColor: COLORS.accent,
               backgroundColor: COLORS.accentTranslucent
             }}>
          <div className="absolute -top-1 -left-1 w-2 h-2" style={{ backgroundColor: COLORS.accent }} />
          <div className="absolute -top-1 -right-1 w-2 h-2" style={{ backgroundColor: COLORS.accent }} />
          <div className="absolute -bottom-1 -left-1 w-2 h-2" style={{ backgroundColor: COLORS.accent }} />
          <div className="absolute -bottom-1 -right-1 w-2 h-2" style={{ backgroundColor: COLORS.accent }} />
          <div className="absolute right-2 bottom-2 px-2 py-1 text-xs font-mono rounded-md"
               style={{ 
                 backgroundColor: COLORS.bgCard, 
                 color: COLORS.text,
                 backdropFilter: 'blur(4px)' 
               }}>
            {Math.round(selection.width * window.devicePixelRatio)} × {Math.round(selection.height * window.devicePixelRatio)}
          </div>
        </div>
      )}

      {/* 阶段 2：Screen 极简录制指示 (进入倒计时及录制期间保持显示) */}
      {isRecordingVisuals && selection && (
        <div 
          className="absolute pointer-events-none transition-all duration-300"
          style={{ 
            left: selection.x, 
            top: selection.y, 
            width: selection.width, 
            height: selection.height,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.05)' 
          }}
        >
          {/* 关键修复 1：使用 -inset 向外扩张 2px 绘制边框，避开裁剪区 */}
          <div className="absolute -inset-[2px] border-[2px] rounded-[1px]" style={{ borderColor: COLORS.red }}></div>
          
          {/* 关键修复 2：四个角的装饰也同步向外推，离开 selection 的边界 */}
          <div className="absolute -top-[4px] -left-[4px] w-3 h-3 border-t-[3px] border-l-[3px]" style={{ borderColor: COLORS.red }} />
          <div className="absolute -top-[4px] -right-[4px] w-3 h-3 border-t-[3px] border-r-[3px]" style={{ borderColor: COLORS.red }} />
          <div className="absolute -bottom-[4px] -left-[4px] w-3 h-3 border-b-[3px] border-l-[3px]" style={{ borderColor: COLORS.red }} />
          <div className="absolute -bottom-[4px] -right-[4px] w-3 h-3 border-b-[3px] border-r-[3px]" style={{ borderColor: COLORS.red }} />
        </div>
      )}
    </div>
  )
}