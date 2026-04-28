import { useState, useRef, useCallback, useEffect } from 'react'
import { SquareMousePointer } from 'lucide-react'

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
    const unlisten = window.caplet.onSwitchToRecordingVisuals(() => {
      setIsRecordingVisuals(true)
    })
    return () => unlisten()
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isRecordingVisuals) return
    setIsSelecting(true)
    setStartPoint({ x: e.clientX, y: e.clientY })
    setSelection(null)
  }, [])

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
    if (e.key === 'Enter' && selection && selection.width > 10 && selection.height > 10) {
      onConfirm(selection)
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }, [selection, onConfirm, onCancel])

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

      {/* ===================== 遮罩层（会镂空） ===================== */}
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
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#selection-mask)" />
        </svg>
      )}

      {/* ===================== 永远可见的顶部提示栏（不参与镂空！） ===================== */}
      {!isRecordingVisuals && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm text-white flex gap-6"
            style={{
              backgroundColor: 'rgba(17, 24, 40, 0.95)',
              border: '2px solid rgba(255, 255, 255, 0.35)',
              backdropFilter: 'blur(10px)',
              zIndex: 10001,
            }}>
          <span className="flex items-center gap-2"><SquareMousePointer size={16} /> 拖拽选择录制区域</span>
          <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded">Enter</kbd> 确认</span>
          <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded">Esc</kbd> 取消</span>
        </div>
      )}

      {/* 录制中遮罩 */}
      {isRecordingVisuals && selection && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="recording-hole">
              <rect width="100%" height="100%" fill="white" />
              <rect x={selection.x} y={selection.y} width={selection.width} height={selection.height} fill="black" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#recording-hole)" />
        </svg>
      )}

      {/* 选框 */}
      {!isRecordingVisuals && selection && (
        <div className="absolute border-2 border-blue-500 bg-transparent"
             style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}>
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-sm" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-sm" />
          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-500 rounded-sm" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 rounded-sm" />

          {/* 内部尺寸提示 */}
          <div className="absolute right-2 bottom-2 px-2 py-1 text-xs font-mono text-white rounded-md"
               style={{ backgroundColor: 'rgba(40,40,40,0.85)', backdropFilter: 'blur(4px)' }}>
            {Math.round(selection.width * window.devicePixelRatio)} × {Math.round(selection.height * window.devicePixelRatio)}
          </div>
        </div>
      )}

    </div>
  )
}