import { useEffect, useRef, useState } from 'react'
import type { CameraSettings } from '../types'
import { Maximize2, Minus, X, Webcam } from 'lucide-react'

const COLORS = {
  bgDeep: '#11181A',
  bgCard: '#1A2628',
  text: '#F5F9F9',
  textMuted: '#6B8A8C',
  accent: '#478A8F',
  borderSubtle: 'rgba(71, 138, 143, 0.25)',
  red: '#D35F5F',
}

interface Props {
  onConfirm?: (settings: CameraSettings) => void
  onCancel?: () => void
  initialMode?: 'preview' | 'recording'
  deviceId?: string
}

export default function CameraPreviewOverlay({ onConfirm, onCancel, initialMode = 'preview', deviceId: initialDeviceId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>(initialDeviceId || '')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [mode] = useState<'preview' | 'recording'>(initialMode)
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [isHovered, setIsHovered] = useState(false)

  const destroyStream = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      setStream(null)
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }

  const initStream = (id: string) => {
    destroyStream()
    navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(s => {
      setStream(s)
      if (videoRef.current) {
        videoRef.current.srcObject = s
      }
    }).catch(err => {
      console.error('[CameraPreview] Failed to get camera stream:', err)
    })
  }

  useEffect(() => {
    return () => {
      destroyStream()
    }
  }, [])

  useEffect(() => {
    if (mode === 'recording' && initialDeviceId) {
      initStream(initialDeviceId)
      return
    }

    navigator.mediaDevices.enumerateDevices().then(allDevices => {
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput')
      setDevices(videoDevices)
      if (videoDevices.length > 0 && !deviceId) {
        setDeviceId(videoDevices[0].deviceId)
      }
    }).catch(console.error)
  }, [mode])

  useEffect(() => {
    if (mode === 'preview' && deviceId) {
      initStream(deviceId)
    }
  }, [deviceId, mode])

  useEffect(() => {
    if (mode !== 'preview' || !onConfirm || !onCancel) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        onConfirm({ deviceId })
      }
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deviceId, onConfirm, onCancel, mode])

  const toggleSize = (e: React.MouseEvent) => {
    e.stopPropagation()
    const nextSize = size === 'sm' ? 'md' : size === 'md' ? 'lg' : 'sm'
    setSize(nextSize)
    window.screenApi.setCameraSize(nextSize)
  }

  if (mode === 'preview') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center select-none" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <div className="fixed top-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm flex gap-6"
          style={{ 
            backgroundColor: COLORS.bgCard, 
            border: `2px solid ${COLORS.borderSubtle}`, 
            color: COLORS.text,
            backdropFilter: 'blur(10px)', 
            zIndex: 10001 
          }}>
          <span className="flex items-center gap-2"><Webcam size={16} /> 纯摄像头录制</span>
          <span><kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>Enter</kbd> 确认</span>
          <span><kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>Esc</kbd> 取消</span>
        </div>

        <div
          className="relative rounded-xl overflow-hidden shadow-2xl"
          style={{ width: 640, height: 360, transform: 'translateZ(0)', backgroundColor: 'rgba(0,0,0,0.8)' }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full pointer-events-none"
            style={{ objectFit: 'cover', transform: 'scaleX(-1)' }}
          />

          {devices.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: COLORS.textMuted }}>
              未检测到摄像头
            </div>
          )}

          <div
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg backdrop-blur border outline-none cursor-pointer"
              style={{ 
                backgroundColor: 'rgba(0,0,0,0.7)', 
                color: COLORS.text,
                borderColor: COLORS.borderSubtle 
              }}
            >
              {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId} style={{ backgroundColor: COLORS.bgDeep, color: COLORS.text }}>
                    {d.label || '未知摄像头'}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-screen h-screen overflow-hidden relative flex items-center justify-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="w-full h-full overflow-hidden rounded-lg"
        style={{
          WebkitAppRegion: 'drag',
          WebkitMaskImage: '-webkit-radial-gradient(white, black)',
          transform: 'translateZ(0)',
          backgroundColor: 'rgba(0,0,0,0.8)'
        } as React.CSSProperties}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full pointer-events-none"
          style={{ objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
      </div>

      <div
        className={`absolute top-2 right-2 flex gap-1.5 transition-opacity duration-200 z-10 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={toggleSize}
          title="切换大小"
          className="p-1.5 rounded-full backdrop-blur-md"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: COLORS.text }}
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={() => window.screenApi.hideCameraWindow()}
          title="隐藏窗口"
          className="p-1.5 rounded-full backdrop-blur-md"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: COLORS.text }}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.screenApi.requestRecordingStop()}
          title="停止录制"
          className="p-1.5 rounded-full backdrop-blur-md"
          style={{ backgroundColor: COLORS.red, color: COLORS.text }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
