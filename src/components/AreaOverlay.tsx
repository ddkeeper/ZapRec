import { useState, useRef, useCallback, useEffect } from 'react'

export interface AreaSelection {
  x: number
  y: number
  width: number
  height: number
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
    // 监听来自主进程的消息，进入幽灵幕布模式
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
      // 专家体验增强：进入录制视觉后，最外层 div 增加 pointer-events-none，
      // 确保配合主进程的 setIgnoreMouseEvents 实现 100% 鼠标穿透
      className={`fixed inset-0 z-[9999] select-none ${isRecordingVisuals ? 'pointer-events-none' : 'cursor-crosshair'}`}
      style={{ 
        WebkitAppRegion: 'no-drag',
        WebkitUserSelect: 'none',
        ...(isRecordingVisuals ? {} : { backgroundColor: 'rgba(0, 0, 0, 0.3)' })
      } as React.CSSProperties}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* ===================== 录制进行中的幽灵镂空幕布 ===================== */}
      {isRecordingVisuals && selection && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="recording-hole">
              {/* 白底代表不透明阴影区 */}
              <rect width="100%" height="100%" fill="white" />
              {/* 黑块代表抠空的区域 (真实的录制区，完全透明) */}
              <rect
                x={selection.x}
                y={selection.y}
                width={selection.width}
                height={selection.height}
                fill="black"
              />
            </mask>
          </defs>

          {/* 全屏阴影幕布，被 recording-hole 镂空，提供沉浸式录制体验。
              注意：录制阶段 (isRecordingVisuals=true) 绝对不在此层绘制红框或指示器！
              因为只要画在屏幕上，不论放在 mask 内外，只要处于选区边缘，都会因为 
              desktopCapturer 捕获全屏合成层的特性，被切进录制视频里，污染用户的素材！*/}
          <rect
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.6)"
            mask="url(#recording-hole)"
          />
        </svg>
      )}

      {/* ===================== 选区操作阶段的 UI ===================== */}
      {!isRecordingVisuals && selection && (
        <div
          className="absolute border-2 border-blue-500 bg-transparent"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
          }}
        >
          {/* 四角手柄 */}
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-sm" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-sm" />
          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-500 rounded-sm" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 rounded-sm" />

          {/* 专家文档建议三：动态尺寸指示器胶囊：绝对定位在当前蓝色选框内部的右下角正下方 */}
          {selection.width > 0 && selection.height > 0 && (
            <div 
              className="absolute px-2 py-1 text-xs font-mono text-white rounded-md select-none pointer-events-none"
              style={{
                right: 0,
                bottom: '-32px', // 向下偏移出选框
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(4px)',
                zIndex: 10000
              }}
            >
              {Math.round(selection.width)} × {Math.round(selection.height)}
            </div>
          )}
        </div>
      )}

      {/* 选区操作阶段的遮罩层 */}
      {!isRecordingVisuals && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {selection ? (
            <defs>
              <mask id="selection-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={selection.x}
                  y={selection.y}
                  width={selection.width}
                  height={selection.height}
                  fill="black"
                />
              </mask>
            </defs>
          ) : (
            <defs>
              <mask id="selection-mask">
                <rect width="100%" height="100%" fill="black" />
              </mask>
            </defs>
          )}
          <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.5)" mask="url(#selection-mask)" />
        </svg>
      )}

      {/* 选区操作阶段的操作提示顶部胶囊 */}
      {!isRecordingVisuals && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm text-white px-6 py-3 rounded-full text-sm flex items-center gap-4 shadow-lg">
          <span>🖱️ 拖拽以选择录制区域</span>
          <span className="text-white/40">|</span>
          <span className="text-green-400 font-medium">↵ Enter 确认</span>
          <span className="text-white/40">|</span>
          <span className="text-red-400 font-medium">Esc 取消</span>
        </div>
      )}
    </div>
  )
}
