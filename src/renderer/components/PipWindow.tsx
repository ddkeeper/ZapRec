import { useEffect, useRef, useState } from 'react'
import { Maximize2, Square, Circle, X } from 'lucide-react'

export default function PipWindow() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [shape, setShape] = useState<'rectangle' | 'circle'>('rectangle')
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    console.log('[PipWindow] useEffect triggered, requesting camera...')
    let stream: MediaStream | null = null

    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    }).then(s => {
      console.log('[PipWindow] Camera stream obtained:', s.id)
      stream = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.play().catch(console.error)
      }
    }).catch(err => {
      console.error('[PipWindow] getUserMedia failed:', err.name, err.message)
    })

    return () => {
      console.log('[PipWindow] Cleanup, stopping tracks...')
      if (stream) {
        stream.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  useEffect(() => {
    const unlistenSize = window.screenApi.onPipSizeChanged((newSize: string) => {
      console.log('[PipWindow] Size changed:', newSize)
      setSize(newSize as 'sm' | 'md' | 'lg')
    })
    const unlistenShape = window.screenApi.onPipShapeChanged((newShape: string) => {
      console.log('[PipWindow] Shape changed:', newShape)
      setShape(newShape as 'circle' | 'rectangle')
    })
    return () => {
      unlistenSize()
      unlistenShape()
    }
  }, [])

  const toggleShape = () => {
    const newShape = shape === 'rectangle' ? 'circle' : 'rectangle'
    setShape(newShape)
    window.screenApi.setPipShape(newShape)
    window.screenApi.setPipSize(size)
  }

  const toggleSize = () => {
    const nextSize = size === 'sm' ? 'md' : size === 'md' ? 'lg' : 'sm'
    setSize(nextSize)
    window.screenApi.setPipSize(nextSize)
  }

  const handleClose = () => {
    window.screenApi.closePipWindow()
  }

  return (
    <div
      className="w-screen h-screen overflow-hidden relative flex items-center justify-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* 拖拽区与视觉容器 */}
      <div
        className={`w-full h-full overflow-hidden bg-black/80
          ${shape === 'rectangle' ? 'rounded-lg' : 'rounded-full'}
        `}
        style={{
          WebkitAppRegion: 'drag',
          WebkitMaskImage: '-webkit-radial-gradient(white, black)',
          transform: 'translateZ(0)'
        } as React.CSSProperties}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full pointer-events-none"
          style={{
            objectFit: 'cover',
            transform: 'scaleX(-1)'
          }}
        />
      </div>

      {/* 控制栏：固定位置，不随形状变化跳动 */}
      <div
        className={`absolute transition-opacity duration-200 z-10
          ${isHovered ? 'opacity-100' : 'opacity-0'}
          top-3 right-3
        `}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex gap-1.5">
          <button
            onClick={toggleSize}
            title="切换大小"
            className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-colors"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={toggleShape}
            title="切换形状"
            className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-colors"
          >
            {shape === 'rectangle' ? <Circle size={14} /> : <Square size={14} />}
          </button>
          <button
            onClick={handleClose}
            title="关闭"
            className="p-1.5 bg-red-500/80 hover:bg-red-600 rounded-full text-white backdrop-blur-md transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
