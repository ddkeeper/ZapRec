import { useEffect, useState, useRef, useCallback } from 'react'
import { useAppStore } from './store/useAppStore'
import Toolbar from './components/Toolbar'
import AreaOverlay, { type AreaSelection } from './components/AreaOverlay'
import { mediaCapturer } from './core/MediaCapturer'
import { audioMixer } from './core/AudioMixer'
import { recordingEngine } from './core/RecordingEngine'
import { QUALITY_PRESETS } from './shared/types'

function App() {
  const isAreaSelectionMode = window.location.hash === '#/area-selection'

  if (isAreaSelectionMode) {
    return <AreaOverlayForSelectionWindow />
  }

  const { setLastSavedPath, status, setStatus } = useAppStore()

  const [defaultPath, setDefaultPath] = useState('')

  const timerRef = useRef<number | null>(null)
  const displayStreamRef = useRef<MediaStream | null>(null)
  const systemAudioStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  // Canvas 裁剪相关 ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  const cropIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /**
   * 创建裁剪后的 MediaStream (仅物理裁剪，放弃任何 PIP 画布混合)
   */
  const createCroppedStream = useCallback(async (
    mainStream: MediaStream, 
    area: AreaSelection | null
  ): Promise<MediaStream> => {
    if (!area) return mainStream

    const mainVideoTrack = mainStream.getVideoTracks()[0]
    if (!mainVideoTrack) {
      console.error('[ZapRec] No video track found in main stream')
      return mainStream
    }

    const mainVideo = document.createElement('video')
    mainVideo.srcObject = new MediaStream([mainVideoTrack])
    mainVideo.muted = true
    mainVideo.autoplay = true
    mainVideo.playsInline = true
    videoElementRef.current = mainVideo

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Main video load timeout')), 5000)
      mainVideo.onloadedmetadata = () => {
        clearTimeout(timeout)
        resolve()
      }
      mainVideo.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Main video error'))
      }
    })

    const vw = mainVideo.videoWidth
    const vh = mainVideo.videoHeight

    let physicalX = 0
    let physicalY = 0
    let physicalW = vw
    let physicalH = vh

    const screenWidth = window.screen.width
    const currentScale = (vw > 0 && screenWidth > 0) ? (vw / screenWidth) : (window.devicePixelRatio || 1)

    physicalX = Math.round(area.x * currentScale)
    physicalY = Math.round(area.y * currentScale)
    physicalW = Math.round(area.width * currentScale)
    physicalH = Math.round(area.height * currentScale)

    physicalX = Math.max(0, Math.min(physicalX, vw))
    physicalY = Math.max(0, Math.min(physicalY, vh))
    physicalW = Math.min(physicalW, vw - physicalX)
    physicalH = Math.min(physicalH, vh - physicalY)

    physicalW = physicalW % 2 === 0 ? physicalW : physicalW - 1
    physicalH = physicalH % 2 === 0 ? physicalH : physicalH - 1

    console.log(`[ZapRec] Main video resolution: ${vw}x${vh}`)
    console.log(`[ZapRec] Output canvas resolution: ${physicalW}x${physicalH}`)

    const canvas = document.createElement('canvas')
    canvas.width = physicalW
    canvas.height = physicalH
    canvasRef.current = canvas

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    mainVideo.play().catch(err => console.error('[ZapRec] Main video play error:', err))

    if (mainVideo.readyState >= 2) {
      ctx.drawImage(mainVideo, physicalX, physicalY, physicalW, physicalH, 0, 0, physicalW, physicalH)
    }

    cropIntervalRef.current = setInterval(() => {
      const v = videoElementRef.current
      if (!v || v.readyState < 2) return
      
      ctx.drawImage(
        v,
        physicalX, physicalY,
        physicalW, physicalH,
        0, 0,
        physicalW, physicalH
      )
    }, 1000 / 30)

    return canvas.captureStream(30)
  }, [])

  const stopCropStream = useCallback(() => {
    if (cropIntervalRef.current) {
      clearInterval(cropIntervalRef.current)
      cropIntervalRef.current = null
    }
    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null
      videoElementRef.current = null
    }
    canvasRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    try {
      // 直接从 store 取最新状态，避免 useCallback 闭包读取到旧值
      const state = useAppStore.getState()
      const currentSource = state.selectedSource
      const currentSourceId = state.selectedSourceId
      const currentSettings = state.settings
      const micEnabled = state.microphoneEnabled
      const sysAudioEnabled = state.systemAudioEnabled

      const quality = QUALITY_PRESETS[currentSettings.quality]
      const outputDir = currentSettings.outputDirectory || defaultPath || ''
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
      const filepath = `${outputDir}/ZapRec_${timestamp}.mp4`

      await window.caplet.streamStart(filepath)

      let displayStream: MediaStream | null = null
      let recordingWidth = quality.width
      let recordingHeight = quality.height

      if (currentSource === 'display' || currentSource === 'window') {
        const sourceId = currentSourceId || 'screen:0:0'
        displayStream = await mediaCapturer.startDisplayCapture(sourceId)
        displayStreamRef.current = displayStream

      } else if (currentSource === 'camera') {
        displayStream = await mediaCapturer.startCameraCapture()
        displayStreamRef.current = displayStream

      } else if (currentSource === 'area') {
        const pendingArea = state.pendingAreaSelection
        if (!pendingArea) {
          console.error('[ZapRec] Area mode but no pending area selection')
          await window.caplet.streamEnd()
          setStatus('idle')
          return
        }

        // 先捕获全屏流
        const rawStream = await mediaCapturer.startDisplayCapture('screen:0:0')
        displayStreamRef.current = rawStream

        // 仅进行纯物理画布裁剪
        displayStream = await createCroppedStream(rawStream, pendingArea)
        // 从 canvasRef 读出实际的物理尺寸
        if (canvasRef.current) {
          recordingWidth = canvasRef.current.width
          recordingHeight = canvasRef.current.height
        }

        // 清除已消费的选区
        useAppStore.getState().setPendingAreaSelection(null)
      }

      if (!displayStream) {
        console.error('[ZapRec] No display stream available')
        await window.caplet.streamEnd()
        setStatus('idle')
        return
      }

      await recordingEngine.initialize(
        { width: recordingWidth, height: recordingHeight, fps: quality.fps },
        () => {}
      )

      recordingEngine.addVideoTrack(displayStream, recordingWidth, recordingHeight)

      if (sysAudioEnabled || micEnabled) {
        await audioMixer.initialize()

        // 系统音：从原始全屏流（displayStreamRef）里取音轨，而非裁剪后的流
        if (sysAudioEnabled && displayStreamRef.current) {
          const audioTracks = displayStreamRef.current.getAudioTracks()
          if (audioTracks.length > 0) {
            const systemStream = new MediaStream([audioTracks[0]])
            systemAudioStreamRef.current = systemStream
            audioMixer.addStream(systemStream, 'system')
          }
        }

        if (micEnabled) {
          const micStream = await mediaCapturer.startMicrophoneCapture()
          micStreamRef.current = micStream
          audioMixer.addStream(micStream, 'microphone')
        }

        await audioMixer.resume()

        const mixedStream = audioMixer.getOutputStream()
        if (mixedStream && mixedStream.getAudioTracks().length > 0) {
          recordingEngine.addAudioTrack(mixedStream)
        }
      }

      await recordingEngine.start()

      setLastSavedPath(filepath)
      setStatus('recording')

      if (currentSettings.autoHide) {
        window.caplet.windowMinimize()
      }

    } catch (error) {
      console.error('[ZapRec] Failed to start recording:', error)
      await window.caplet.streamEnd()
      setStatus('idle')
    }
  }, [defaultPath, setStatus, setLastSavedPath, createCroppedStream])

  const stopRecording = useCallback(async () => {
    try {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      await recordingEngine.stop()
      await window.caplet.streamEnd()

      stopCropStream()
      audioMixer.destroy()
      mediaCapturer.stopAll()

      displayStreamRef.current = null
      systemAudioStreamRef.current = null
      micStreamRef.current = null

      useAppStore.getState().reset()
      setStatus('idle')

      // 通知主进程销毁幽灵镂空幕布
      window.caplet.sendRecordingStopped()

    } catch (error) {
      console.error('[ZapRec] Failed to stop recording:', error)
      await window.caplet.streamEnd()
      useAppStore.getState().reset()
      setStatus('idle')
      window.caplet.sendRecordingStopped()
    }
  }, [setStatus, stopCropStream])

  useEffect(() => {
    const loadDefaultPath = async () => {
      try {
        const p = await window.caplet.getDefaultSavePath()
        setDefaultPath(p)
        setLastSavedPath(p)
      } catch (error) {
        console.error('[ZapRec] Failed to load default save path:', error)
      }
    }
    loadDefaultPath()

    const unlistenRecord = window.caplet.onShortcutToggleRecord(() => {
      const s = useAppStore.getState().status
      if (s === 'recording') stopRecording()
      else if (s === 'idle') startRecording()
    })

    const unlistenPause = window.caplet.onShortcutTogglePause(() => {
      console.log('[ZapRec] Toggle pause shortcut triggered')
    })

    return () => {
      unlistenRecord()
      unlistenPause()
    }
  }, [setLastSavedPath, startRecording, stopRecording])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      stopCropStream()
      mediaCapturer.stopAll()
      audioMixer.destroy()
    }
  }, [stopCropStream])

  useEffect(() => {
    const unlisten = window.caplet.onAreaSelectionCancelled(() => {
      useAppStore.getState().setSelectedSource('display')
    })
    return () => unlisten()
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Toolbar
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        isRecording={status === 'recording'}
      />
    </div>
  )
}

export default App

function AreaOverlayForSelectionWindow() {
  const handleConfirm = (area: AreaSelection) => {
    window.caplet.sendAreaSelected(area)
  }
  const handleCancel = () => {
    window.caplet.cancelAreaSelection()
  }
  return <AreaOverlay onConfirm={handleConfirm} onCancel={handleCancel} />
}
