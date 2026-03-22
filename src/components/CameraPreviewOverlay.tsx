import { useEffect, useRef, useState } from 'react'
import type { CameraSettings } from '../shared/types'

interface Props {
  onConfirm: (settings: CameraSettings) => void
  onCancel: () => void
}

export default function CameraPreviewOverlay({ onConfirm, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [stream, setStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(allDevices => {
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput')
      setDevices(videoDevices)
      if (videoDevices.length > 0 && !deviceId) {
        setDeviceId(videoDevices[0].deviceId)
      }
    }).catch(console.error)
  }, [])

  useEffect(() => {
    if (!deviceId) return

    if (stream) {
      stream.getTracks().forEach(t => t.stop())
    }

    let newStream: MediaStream | null = null

    navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(s => {
      newStream = s
      setStream(s)
      if (videoRef.current) {
        videoRef.current.srcObject = s
      }
    }).catch(err => {
      console.error('[CameraPreview] Failed to get camera stream:', err)
    })

    return () => {
      if (newStream) {
        newStream.getTracks().forEach(t => t.stop())
      }
    }
  }, [deviceId])

  useEffect(() => {
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
  }, [deviceId, onConfirm, onCancel])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center select-none bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* 视频预览区 */}
        <div className="relative w-[640px] h-[360px] bg-black">
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline
            className="w-full h-full object-cover -scale-x-100"
          />
          {devices.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 bg-black/50">
              未检测到摄像头
            </div>
          )}
        </div>

        {/* 底部紧凑控制栏 (单行布局) */}
        <div className="flex items-center justify-between px-5 py-3 bg-black/20">
          
          {/* 左侧：设备选择 */}
          <select 
            className="bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none cursor-pointer hover:bg-white/20 transition-colors"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId} className="bg-gray-800">
                {d.label || '未知摄像头'}
              </option>
            ))}
          </select>

          {/* 右侧：操作提示 */}
          <div className="flex items-center gap-4 text-sm tracking-wide">
            <span className="text-red-400 font-medium cursor-pointer hover:text-red-300 transition-colors" onClick={onCancel}>
              Esc 取消
            </span>
            <span className="text-white/20">|</span>
            <span className="text-green-400 font-medium cursor-pointer hover:text-green-300 transition-colors" onClick={() => onConfirm({ deviceId })}>
              Enter 确认录制
            </span>
          </div>

        </div>
      </div>
    </div>
  )
}