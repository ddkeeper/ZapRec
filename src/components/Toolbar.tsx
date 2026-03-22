import { useCallback, useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { RecordingSource } from '../shared/types'
import { useRecordingCountdown } from '../hooks/useRecordingCountdown'
import { 
  Settings, 
  Monitor, 
  AppWindow, 
  Square, 
  Video, 
  SquareUser, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX,
  Pause,
  Play,
  Undo2,
  X
} from 'lucide-react'

const sourceIcons: Record<RecordingSource, typeof Monitor> = {
  display: Monitor,
  window: AppWindow,
  area: Square,
  camera: Video
}

const sourceLabels: Record<RecordingSource, string> = {
  display: '全屏',
  window: '窗口',
  area: '区域',
  camera: '镜头'
}

interface ToolbarProps {
  onStartRecording: () => void
  onStopRecording: () => void
  isRecording: boolean
  onOpenWindowPicker?: () => void
}

export default function Toolbar({ onStartRecording, onStopRecording, isRecording, onOpenWindowPicker }: ToolbarProps) {
  const {
    status,
    countdownValue,
    setSelectedSource,
    setPendingAreaSelection,
    microphoneEnabled,
    setMicrophoneEnabled,
    systemAudioEnabled,
    setSystemAudioEnabled,
    cameraEnabled,
    setCameraEnabled
  } = useAppStore()

  const { startCountdown } = useRecordingCountdown()

  const [recordingTime, setRecordingTime] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (isRecording && !isPaused) {
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      return () => clearInterval(timer)
    } else if (!isRecording) {
      setRecordingTime(0)
    }
  }, [isRecording, isPaused])

  useEffect(() => {
    const unlisten = window.caplet.onAreaSelected((area) => {
      setPendingAreaSelection(area)
      setSelectedSource('area')
      startCountdown(() => onStartRecording())
    })
    
    return () => unlisten()
  }, [setSelectedSource, setPendingAreaSelection, startCountdown, onStartRecording])

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleSourceClick = useCallback((source: RecordingSource) => {
    if (status !== 'idle') return
    
    if (source === 'area') {
      setSelectedSource(source)
      window.caplet.startAreaSelection()
      return
    }
    
    if (source === 'window') {
      setSelectedSource(source)
      onOpenWindowPicker?.()
      return
    }

    if (source === 'camera') {
      setSelectedSource(source)
      window.caplet.startCameraPreview()
      return
    }
    
    setSelectedSource(source)
    startCountdown(() => onStartRecording())
  }, [status, setSelectedSource, startCountdown, onStartRecording, onOpenWindowPicker])

  const handleRecordToggle = useCallback(() => {
    if (isRecording) {
      onStopRecording()
    }
  }, [isRecording, onStopRecording])

  return (
    <div 
      className="w-max flex items-center h-14 px-3 rounded-2xl overflow-hidden select-none transition-all duration-300"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(48px)',
        WebkitBackdropFilter: 'blur(48px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* 左侧：设置按钮 - 始终显示 */}
      <button
        onClick={() => {}}
        disabled={isRecording}
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0 ${
          isRecording 
            ? 'text-white/30 cursor-not-allowed' 
            : 'hover:bg-white/10 text-white/90'
        }`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="设置"
      >
        <Settings size={18} strokeWidth={2} color={isRecording ? 'rgba(255,255,255,0.3)' : 'white'} />
      </button>

      {/* 分割线1 */}
      <div className="w-px h-8 bg-white/30 mx-3 shrink-0" />

      {/* 中间：录制源 或 计时器+控制 */}
      <div className="flex items-center justify-center gap-1 min-w-[220px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {status === 'recording' || status === 'paused' ? (
          <>
            {/* 计时器 */}
            <div className="flex items-center gap-2 mr-2">
              <div 
                className="w-2.5 h-2.5 rounded-full"
                style={{ 
                  backgroundColor: status === 'paused' ? '#fbbf24' : '#ef4444',
                  boxShadow: status === 'paused' 
                    ? '0 0 8px rgba(251,191,36,0.8)' 
                    : '0 0 8px rgba(239,68,68,0.8)'
                }}
              />
              <span className="font-mono text-white text-sm font-medium tracking-wide">
                {formatTime(recordingTime)}
              </span>
            </div>
            {/* 暂停/恢复 */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="p-2 rounded-md hover:bg-white/10 text-white/90 transition-colors"
              title={isPaused ? "恢复" : "暂停"}
            >
              {isPaused ? <Play size={16} strokeWidth={2} /> : <Pause size={16} strokeWidth={2} />}
            </button>
            {/* 停止 */}
            <button
              onClick={handleRecordToggle}
              className="p-2 rounded-md hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-colors"
              title="停止录制"
            >
              <Square size={16} strokeWidth={2} fill="currentColor" />
            </button>
          </>
        ) : status === 'countdown' ? (
          /* 倒计时状态 */
          <div className="flex items-center gap-4 mr-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
              <span className="font-mono text-yellow-400 text-sm font-medium tracking-wide">
                即将开始: {countdownValue}s
              </span>
            </div>
            
            <div className="flex items-center gap-2 border-l border-white/10 pl-3">
              <button
                onClick={() => {
                  const store = useAppStore.getState()
                  
                  store.setStatus('idle')
                  store.setCountdownValue(0)
                  
                  if (store.selectedSource === 'area') {
                    window.caplet.cancelAreaSelection()
                    store.setPendingAreaSelection(null)
                  } else if (store.selectedSource === 'window') {
                    store.setSelectedWindow(null)
                  } else if (store.selectedSource === 'camera') {
                    store.setPendingCameraSettings(null)
                  }
                }}
                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-all"
                title="返回上一步 (Esc)"
              >
                <Undo2 size={16} />
              </button>
            </div>
          </div>
        ) : (
          /* 录制源按钮 */
          (['display', 'window', 'area', 'camera'] as const).map((source) => {
            const IconComponent = sourceIcons[source]
            const titles: Record<RecordingSource, string> = {
              display: '录制整个屏幕',
              window: '录制指定窗口',
              area: '录制屏幕区域',
              camera: '仅录制摄像头'
            }
            return (
              <button
                key={source}
                onClick={() => handleSourceClick(source)}
                className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-all hover:bg-white/10"
                title={titles[source]}
              >
                <IconComponent size={18} strokeWidth={2} color="rgba(255,255,255,0.9)" />
                <span className="text-xs mt-0.5 text-white/90 font-medium">
                  {sourceLabels[source]}
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* 分割线2 */}
      <div className="w-px h-8 bg-white/30 mx-3 shrink-0" />

      {/* 右侧：音频开关 - 始终显示 */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => setMicrophoneEnabled(!microphoneEnabled)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all shrink-0 hover:bg-white/10"
          title={microphoneEnabled ? "麦克风：关闭" : "麦克风：开启"}
        >
          {microphoneEnabled
            ? <Mic size={18} strokeWidth={2} color="white" />
            : <MicOff size={18} strokeWidth={2} color="rgba(255,255,255,0.4)" />
          }
          <span className={`text-sm whitespace-nowrap font-medium ${microphoneEnabled ? 'text-white' : 'text-white/40'}`}>
            麦克风
          </span>
        </button>

        <button
          onClick={() => setSystemAudioEnabled(!systemAudioEnabled)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all shrink-0 hover:bg-white/10"
          title={systemAudioEnabled ? "系统声音：关闭" : "系统声音：开启"}
        >
          {systemAudioEnabled
            ? <Volume2 size={18} strokeWidth={2} color="white" />
            : <VolumeX size={18} strokeWidth={2} color="rgba(255,255,255,0.4)" />
          }
          <span className={`text-sm whitespace-nowrap font-medium ${systemAudioEnabled ? 'text-white' : 'text-white/40'}`}>
            系统音
          </span>
        </button>

        <button
          onClick={() => setCameraEnabled(!cameraEnabled)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all shrink-0 hover:bg-white/10"
          title={cameraEnabled ? "画中画：关闭" : "画中画：开启"}
        >
          <SquareUser size={18} strokeWidth={2} color={cameraEnabled ? 'white' : 'rgba(255,255,255,0.4)'} />
          <span className={`text-sm whitespace-nowrap font-medium ${cameraEnabled ? 'text-white' : 'text-white/40'}`}>
            画中画
          </span>
        </button>
      </div>

      {/* 分割线3 */}
      <div className="w-px h-8 bg-white/30 mx-3 shrink-0" />

      {/* 关闭按钮 */}
      <button
        onClick={() => window.caplet.windowClose()}
        className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/10 text-white/90 transition-colors shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="关闭"
      >
        <X size={18} strokeWidth={2} />
      </button>
    </div>
  )
}
