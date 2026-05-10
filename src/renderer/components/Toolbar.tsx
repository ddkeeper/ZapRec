import { useCallback, useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { RecordingSource } from '../types'
import { useRecordingCountdown } from '../hooks/useRecordingCountdown'
import { cancelPreWarming, startPreWarming } from '../core/recordingPreWarming'
import { recordingEngine } from '../core/RecordingEngine'
import { 
  Settings, 
  Monitor, 
  AppWindow, 
  Square, 
  Video, 
  PictureInPicture2, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX,
  Pause,
  Play,
  Undo2,
  X,
  Headphones
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

const CrispDivider = () => (
  <svg width="2" height="42" className="mx-2.5 shrink-0" shapeRendering="crispEdges">
    <rect width="2" height="42" fill="#2C3E40" />
  </svg>
)

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
    pipEnabled,
    setPipEnabled,
    pipButtonDisabled,
    isPaused,
    setIsPaused,
    setStatus
  } = useAppStore()

  const { startCountdown } = useRecordingCountdown()

  const [recordingTime, setRecordingTime] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const showAudioWarning = microphoneEnabled && systemAudioEnabled;

  useEffect(() => {
    ;(window.screenApi as any).settingsLoad().then((settings: { lastState?: { microphoneEnabled?: boolean; systemAudioEnabled?: boolean; pipEnabled?: boolean } }) => {
      if (settings.lastState) {
        if (typeof settings.lastState.microphoneEnabled === 'boolean') {
          setMicrophoneEnabled(settings.lastState.microphoneEnabled)
        }
        if (typeof settings.lastState.systemAudioEnabled === 'boolean') {
          setSystemAudioEnabled(settings.lastState.systemAudioEnabled)
        }
        if (typeof settings.lastState.pipEnabled === 'boolean') {
          setPipEnabled(settings.lastState.pipEnabled)
        }
      }
    }).catch(console.error)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.target.getBoundingClientRect()
        const width = Math.round(rect.width)
        const height = Math.round(rect.height)
        if (window.screenApi?.resizeToolbar) {
          window.screenApi.resizeToolbar(width, height)
        }
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (isRecording && !isPaused) {
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      return () => clearInterval(timer)
    } else if (!isRecording && !isPaused) {
      setRecordingTime(0)
    }
  }, [isRecording, isPaused])

  useEffect(() => {
    const unlisten = window.screenApi.onAreaSelected((area) => {
      setPendingAreaSelection(area)
      setSelectedSource('area')
      startPreWarming()
      startCountdown()
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
      window.screenApi.startAreaSelection()
      return
    }
    
    if (source === 'window' || source === 'camera') {
      const store = useAppStore.getState()
      if (store.pipEnabled) {
        store.setSavedPipEnabled(true)
        store.setPipEnabled(false)
      }
      store.setPipButtonDisabled(true)
      setSelectedSource(source)
      if (source === 'window') onOpenWindowPicker?.()
      else window.screenApi.startCameraPreview()
      return
    }
    
    setSelectedSource(source)
    startPreWarming()
    startCountdown()
  }, [status, setSelectedSource, startCountdown, onStartRecording, onOpenWindowPicker])

  return (
    <div 
      ref={containerRef}
      className="inline-flex w-max items-center h-[60px] px-3 rounded-[20px] select-none overflow-hidden pointer-events-auto"
      style={{
        backgroundColor: '#11181A',
        border: '1px solid rgba(0, 0, 0, 0.8)',
        boxShadow: 'inset 0 0 0 1px rgba(71, 138, 143, 0.25)',
        boxSizing: 'border-box',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <button
        onClick={() => (window.screenApi as any).openSettings()}
        className="flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 shrink-0 active:scale-95 text-[#6B8A8C] hover:text-[#F5F9F9]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="设置"
      >
        <Settings size={20} strokeWidth={1.5} />
      </button>

      <CrispDivider />

      <div 
        className="flex items-center justify-center w-[250px] transition-all duration-300" 
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {status === 'recording' || status === 'paused' ? (
          <div className="flex items-center justify-center w-full gap-5">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: isPaused ? '#D9A05B' : '#D35F5F' }} />
              <span className="font-mono text-[#F5F9F9]/95 text-[16px] font-medium tracking-wide">
                {formatTime(recordingTime)}
              </span>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const newPaused = !isPaused
                  setIsPaused(newPaused)
                  setStatus(newPaused ? 'paused' : 'recording')

                  recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
                    if (newPaused) {
                      const segmentPath = await recordingEngine.pause()
                      await window.screenApi.streamEnd()
                      if (segmentPath) {
                        useAppStore.getState().addRecordingSegment(segmentPath)
                      }
                    } else {
                      const nextSegmentPath = recordingEngine.generateNextSegmentPath()
                      if (nextSegmentPath) {
                        recordingEngine.setFilePath(nextSegmentPath)
                        await window.screenApi.streamStart(nextSegmentPath)
                      }
                      await recordingEngine.resume()
                    }
                  }).catch(console.error)
                }}
                className="flex items-center justify-center w-[42px] h-[42px] rounded-xl text-[#6B8A8C] hover:text-[#F5F9F9] active:scale-95 transition-all duration-200"
                title={isPaused ? "恢复" : "暂停"}
              >
                {isPaused ? (
                  <Play size={20} strokeWidth={2} className="hover:scale-110 transition-transform duration-200" />
                ) : (
                  <Pause size={20} strokeWidth={2} className="hover:scale-110 transition-transform duration-200" />
                )}
              </button>
              
              <button
                onClick={() => onStopRecording()}
                className="flex items-center justify-center w-[42px] h-[42px] rounded-xl transition-all duration-200 active:scale-95 text-red-400/80 hover:text-red-400 hover:bg-red-500/10 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                title="停止录制"
              >
                <Square size={18} strokeWidth={2.5} fill="currentColor" className="hover:scale-105 transition-transform duration-200" />
              </button>
            </div>
          </div>
        ) : status === 'countdown' ? (
          <div 
            className={`flex items-center w-full transition-all duration-300 ${
              showAudioWarning ? 'justify-between px-1' : 'justify-center gap-2'
            }`}
          >
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-[#D9A05B] animate-pulse shrink-0" />
              <span className="font-mono text-[#D9A05B]/95 text-[14px] whitespace-nowrap transition-all">
                {showAudioWarning ? '倒计时:' : '录制倒计时:'} <span className="inline-block w-[2ch] tabular-nums text-right">{countdownValue}</span>s
              </span>
            </div>

            {showAudioWarning && (
              <div 
                className="mx-1.5 px-2 py-1 bg-[#1A2628] rounded-lg border border-[#478A8F]/30 flex items-center shrink min-w-0"
                title="同时开启了系统音和麦克风，建议佩戴耳机防止回音"
              >
                <Headphones size={13} className="text-[#478A8F]/90 mr-1 shrink-0" />
                <span className="text-[#82A3A5] text-[11px] whitespace-nowrap truncate select-none">
                  建议戴耳机
                </span>
              </div>
            )}

            <button
              onClick={() => cancelPreWarming()}
              className="flex items-center justify-center w-[38px] h-[38px] text-[#6B8A8C] hover:text-[#F5F9F9] rounded-xl transition-all active:scale-95 shrink-0"
              title="返回 (Esc)"
            >
              <Undo2 size={18} strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 w-full">
            {(['display', 'window', 'area', 'camera'] as const).map((source) => {
              const IconComponent = sourceIcons[source]
              return (
                <button
                  key={source}
                  onClick={() => handleSourceClick(source)}
                  className="flex flex-col items-center justify-center w-[56px] h-[46px] rounded-xl transition-all duration-200 group active:scale-95 text-[#6B8A8C] hover:text-[#F5F9F9]"
                >
                  <IconComponent 
                    size={22} 
                    strokeWidth={1.5} 
                    className="group-hover:-translate-y-[1px] transition-transform duration-200" 
                  />
                  <span className="text-[11px] mt-0.5 tracking-wide font-medium">
                    {sourceLabels[source]}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <CrispDivider />

      <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => {
            const newValue = !microphoneEnabled
            setMicrophoneEnabled(newValue)
            ;(window.screenApi as any).settingsSet('lastState.microphoneEnabled', newValue)
          }}
          className={`flex items-center gap-1.5 px-3 h-[42px] rounded-xl transition-all duration-200 shrink-0 ${
            microphoneEnabled ? 'text-[#F5F9F9]' : 'text-[#6B8A8C] hover:text-[#F5F9F9]'
          }`}
        >
          {microphoneEnabled ? <Mic size={20} strokeWidth={2} /> : <MicOff size={20} strokeWidth={1.5} />}
          <span className={`text-[13px] tracking-wide ${microphoneEnabled ? 'font-semibold' : 'font-medium'}`}>
            麦克风
          </span>
        </button>

        <button
          onClick={() => {
            const newValue = !systemAudioEnabled
            setSystemAudioEnabled(newValue)
            ;(window.screenApi as any).settingsSet('lastState.systemAudioEnabled', newValue)
          }}
          className={`flex items-center gap-1.5 px-3 h-[42px] rounded-xl transition-all duration-200 shrink-0 ${
            systemAudioEnabled ? 'text-[#F5F9F9]' : 'text-[#6B8A8C] hover:text-[#F5F9F9]'
          }`}
        >
          {systemAudioEnabled ? <Volume2 size={20} strokeWidth={2} /> : <VolumeX size={20} strokeWidth={1.5} />}
          <span className={`text-[13px] tracking-wide ${systemAudioEnabled ? 'font-semibold' : 'font-medium'}`}>
            系统音
          </span>
        </button>

        <button
          onClick={() => {
            if (!pipButtonDisabled) {
              const newValue = !pipEnabled
              setPipEnabled(newValue)
              ;(window.screenApi as any).settingsSet('lastState.pipEnabled', newValue)
            }
          }}
          disabled={pipButtonDisabled}
          className={`flex items-center gap-1.5 px-3 h-[42px] rounded-xl transition-all duration-200 shrink-0 ${
            pipButtonDisabled ? 'opacity-30 cursor-not-allowed text-slate-400' : pipEnabled ? 'text-[#F5F9F9]' : 'text-[#6B8A8C] hover:text-[#F5F9F9]'
          }`}
        >
          <PictureInPicture2 size={20} strokeWidth={pipEnabled ? 2 : 1.5} fill="none" />
          <span className={`text-[13px] tracking-wide ${pipEnabled ? 'font-semibold' : 'font-medium'}`}>
            画中画
          </span>
        </button>
      </div>

      <CrispDivider />

      <button
        onClick={() => window.screenApi.windowMinimize()}
        className="flex items-center justify-center w-9 h-9 rounded-xl text-[#6B8A8C] hover:text-[#F5F9F9] transition-all duration-200 shrink-0 active:scale-95"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="最小化到托盘"
      >
        <X size={20} strokeWidth={1.5} />
      </button>
    </div>
  )
}