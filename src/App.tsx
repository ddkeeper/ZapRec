import { useEffect, useState, useRef, useCallback } from 'react'
import { useAppStore } from './store/useAppStore'
import Toolbar from './components/Toolbar'
import AreaOverlay, { type AreaSelection } from './components/AreaOverlay'
import WindowPicker from './components/WindowPicker'
import CameraPreviewOverlay from './components/CameraPreviewOverlay'
import { mediaCapturer } from './core/MediaCapturer'
import { audioMixer } from './core/AudioMixer'
import { recordingEngine } from './core/RecordingEngine'
import { startPreWarming, getPrepRecordingDimensions } from './core/recordingPreWarming'
import { QUALITY_PRESETS, type CameraSettings } from './shared/types'
import { useRecordingCountdown } from './hooks/useRecordingCountdown'
import { usePipSync } from './hooks/usePipSync'
import type { ConcatParams } from './global'

function App() {
  const isAreaSelectionMode = window.location.hash === '#/area-selection'
  const isCameraPreviewMode = window.location.hash === '#/camera-preview'
  const isWindowPickerMode = window.location.hash === '#/window-picker'

  if (isCameraPreviewMode) {
    return <CameraPreviewOverlay
      onConfirm={(settings: CameraSettings) => window.caplet.sendCameraSettingsConfirmed(settings)}
      onCancel={() => window.caplet.cancelCameraPreview()}
    />
  }

  if (isAreaSelectionMode) {
    return <AreaOverlayForSelectionWindow />
  }

  if (isWindowPickerMode) {
    return <WindowPickerForSelectionWindow />
  }

  const { setLastSavedPath, status, setStatus, isCountdownFinished, prepState } = useAppStore()
  const { startCountdown } = useRecordingCountdown()
  usePipSync()

  const [defaultPath, setDefaultPath] = useState('')

  const timerRef = useRef<number | null>(null)
  const displayStreamRef = useRef<MediaStream | null>(null)
  const systemAudioStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  const restorePipState = useCallback(() => {
    const store = useAppStore.getState()
    if (store.savedPipEnabled) {
      store.setPipEnabled(true)
    }
    store.setSavedPipEnabled(null)
    store.setPipButtonDisabled(false)
  }, [])

  const commitRecording = useCallback(async () => {
    try {
      const state = useAppStore.getState()
      const { settings, selectedSource, pendingAreaSelection } = state
      const outputDir = settings.outputDirectory || defaultPath || ''
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
      const filepath = `${outputDir}/ZapRec_${timestamp}.mp4`

      if (selectedSource === 'area' && pendingAreaSelection) {
        const { width: actualWidth, height: actualHeight } = getPrepRecordingDimensions()
        
        useAppStore.getState().setActiveCropArea({
          x: pendingAreaSelection.x,
          y: pendingAreaSelection.y,
          width: pendingAreaSelection.width,
          height: pendingAreaSelection.height,
          scaleX: actualWidth / window.screen.width,
          scaleY: actualHeight / window.screen.height
        })
      }

      const part1Path = recordingEngine.initializePaths(filepath)
      await window.caplet.streamStart(part1Path)
      setLastSavedPath(filepath)

      await recordingEngine.start()

      if (selectedSource === 'camera') {
        window.caplet.showCameraWindow()
        if (settings.autoHide) {
          await window.caplet.windowMinimize()
        }
      } else {
        if (settings.autoHide) {
          window.caplet.windowMinimize()
        }
      }

      setStatus('recording')
    } catch (error) {
      console.error('[ZapRec] Failed to commit recording:', error)
      useAppStore.getState().setStatus('idle')
    }
  }, [defaultPath, setLastSavedPath, setStatus])

const startRecording = useCallback(async () => {
    const state = useAppStore.getState()
    const currentSource = state.selectedSource
    const currentSourceId = state.selectedSourceId
    const currentSettings = state.settings
    const microphoneEnabled = state.microphoneEnabled
    const systemAudioEnabled = state.systemAudioEnabled

    const quality = QUALITY_PRESETS[currentSettings.quality]
    const outputDir = currentSettings.outputDirectory || defaultPath || ''
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
    const filepath = `${outputDir}/ZapRec_${timestamp}.mp4`

    const part1Path = recordingEngine.initializePaths(filepath)
    await window.caplet.streamStart(part1Path)

    let displayStream: MediaStream | null = null
    let recordingWidth = quality.width
    let recordingHeight = quality.height

    if (currentSource === 'display') {
      const sourceId = currentSourceId || 'screen:0:0'
      displayStream = await mediaCapturer.startDisplayCapture(sourceId)
      displayStreamRef.current = displayStream

    } else if (currentSource === 'window') {
      const windowInfo = state.selectedWindow
      if (!windowInfo) {
        console.error('[ZapRec] Window mode but no window selected')
        recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
          await window.caplet.streamEnd()
        }).catch(console.error)
        setStatus('idle')
        return
      }
      displayStream = await mediaCapturer.startWindowCapture(windowInfo.id)
      displayStreamRef.current = displayStream

      const videoTrack = displayStream.getVideoTracks()[0]
      if (videoTrack) {
        const getRealDimensions = (stream: MediaStream): Promise<{ width: number, height: number }> => {
          return new Promise((resolve) => {
            const video = document.createElement('video')
            video.srcObject = stream
            video.muted = true

            video.onloadedmetadata = () => {
              resolve({ width: video.videoWidth, height: video.videoHeight })
              video.srcObject = null
            }
            video.play().catch(() => {})
          })
        }

        const realSize = await getRealDimensions(displayStream)
        recordingWidth = realSize.width
        recordingHeight = realSize.height
        if (recordingWidth % 2 !== 0) recordingWidth--
        if (recordingHeight % 2 !== 0) recordingHeight--

        videoTrack.onended = () => {
          console.warn('[ZapRec] 目标窗口已关闭，自动停止并保存录制')
          stopRecording()
        }
      }

    } else if (currentSource === 'camera') {
      const pendingSettings = state.pendingCameraSettings
      if (!pendingSettings) {
        console.error('[ZapRec] Camera mode but no pending settings')
        recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
          await window.caplet.streamEnd()
        }).catch(console.error)
        restorePipState()
        setStatus('idle')
        return
      }

      displayStream = await mediaCapturer.startCameraCapture(microphoneEnabled, pendingSettings.deviceId)
      displayStreamRef.current = displayStream

      const videoTrack = displayStream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings()

        recordingWidth = settings.width || quality.width
        recordingHeight = settings.height || quality.height

        if (recordingWidth % 2 !== 0) recordingWidth--
        if (recordingHeight % 2 !== 0) recordingHeight--

        console.log(`[ZapRec] 摄像头录制就绪，真实分辨率: ${recordingWidth}x${recordingHeight}`)

        useAppStore.getState().setPendingCameraSettings(null)
      } else {
        console.error('[ZapRec] 无法获取摄像头视频轨道')
        recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
          await window.caplet.streamEnd()
        }).catch(console.error)
        restorePipState()
        setStatus('idle')
        return
      }

    } else if (currentSource === 'area') {
      const pendingArea = state.pendingAreaSelection
      if (!pendingArea) {
        console.error('[ZapRec] Area mode but no pending area selection')
        recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
          await window.caplet.streamEnd()
        }).catch(console.error)
        setStatus('idle')
        return
      }

      const rawStream = await mediaCapturer.startDisplayCapture('screen:0:0')
      displayStreamRef.current = rawStream
      displayStream = rawStream

      const videoSettings = rawStream.getVideoTracks()[0].getSettings()
      recordingWidth = videoSettings.width || window.screen.width
      recordingHeight = videoSettings.height || window.screen.height

      if (recordingWidth % 2 !== 0) recordingWidth--
      if (recordingHeight % 2 !== 0) recordingHeight--

      useAppStore.getState().setActiveCropArea({
        ...pendingArea,
        scaleX: recordingWidth / window.screen.width,
        scaleY: recordingHeight / window.screen.height
      })

      useAppStore.getState().setPendingAreaSelection(null)
    }

    if (!displayStream) {
      console.error('[ZapRec] No display stream available')
      recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
        await window.caplet.streamEnd()
      }).catch(console.error)
      setStatus('idle')
      return
    }

    await recordingEngine.initialize(
      { width: recordingWidth, height: recordingHeight, fps: quality.fps },
      () => {}
    )

    recordingEngine.addVideoTrack(displayStream, recordingWidth, recordingHeight)

    await audioMixer.initialize()

    if (displayStreamRef.current) {
      const audioTracks = displayStreamRef.current.getAudioTracks()
      if (audioTracks.length > 0) {
        const systemStream = new MediaStream([audioTracks[0]])
        systemAudioStreamRef.current = systemStream
        const isSystemAdded = audioMixer.addStream(systemStream, 'system')
        if (isSystemAdded) {
          audioMixer.setGain('system', systemAudioEnabled ? 1 : 0)
        } else {
          console.warn('[ZapRec] System audio stream was empty or failed to add to mixer.')
        }
      } else if (systemAudioEnabled) {
        console.warn('[ZapRec] Expected system audio but no audio tracks found in display stream.')
      }
    }

    const micStream = await mediaCapturer.startMicrophoneCapture()
    micStreamRef.current = micStream
    const isMicAdded = audioMixer.addStream(micStream, 'microphone')
    if (isMicAdded) {
      audioMixer.setGain('microphone', microphoneEnabled ? 1 : 0)
    } else {
      console.warn('[ZapRec] Microphone stream was empty or failed to add to mixer.')
    }

    await audioMixer.resume()

    const mixedStream = audioMixer.getOutputStream()
    if (mixedStream && mixedStream.getAudioTracks().length > 0) {
      recordingEngine.addAudioTrack(mixedStream)
    }

    await recordingEngine.start()

    setLastSavedPath(filepath)

    if (currentSource === 'camera') {
      window.caplet.showCameraWindow()
      if (currentSettings.autoHide) {
        await window.caplet.windowMinimize()
      }
    }

    setStatus('recording')

    if (currentSettings.autoHide) {
      window.caplet.windowMinimize()
    }

  }, [defaultPath, setStatus, setLastSavedPath, restorePipState])

const stopRecording = useCallback(() => {
  const store = useAppStore.getState()
  const wasCameraMode = store.selectedSource === 'camera'
  const wasAreaMode = store.selectedSource === 'area'
  const savedPip = store.savedPipEnabled
  const cropArea = store.activeCropArea
  const currentSegments = [...store.recordingSegments]

  if (timerRef.current) {
    clearInterval(timerRef.current)
    timerRef.current = null
  }
  store.reset()
  setStatus('idle')

  recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
    try {
      const lastSegmentPath = await recordingEngine.stopAndSave()
      await window.caplet.streamEnd()
      window.caplet.sendRecordingStopped()

      const allSegments = [...currentSegments, lastSegmentPath].filter(Boolean) as string[]
      const finalPath = recordingEngine.getBaseFilePath()

      if (wasCameraMode) {
        window.caplet.closeCameraPreviewWindow()
      }

      mediaCapturer.stopAll()
      if (systemAudioStreamRef.current) {
        systemAudioStreamRef.current.getTracks().forEach(track => track.stop())
        systemAudioStreamRef.current = null
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop())
        micStreamRef.current = null
      }
      audioMixer.destroy()
      displayStreamRef.current = null

      if (wasCameraMode && savedPip) {
        restorePipState()
      }

      let cropParamsStr: string | undefined = undefined
      if (wasAreaMode && cropArea) {
        const finalW = Math.floor((cropArea.width * cropArea.scaleX) / 2) * 2
        const finalH = Math.floor((cropArea.height * cropArea.scaleY) / 2) * 2
        const finalX = Math.floor((cropArea.x * cropArea.scaleX) / 2) * 2
        const finalY = Math.floor((cropArea.y * cropArea.scaleY) / 2) * 2
        cropParamsStr = `${finalW}:${finalH}:${finalX}:${finalY}`
      }

      if (allSegments.length > 1 && finalPath) {
        const concatParams: ConcatParams = {
          segments: allSegments,
          finalPath,
          cropParams: cropParamsStr
        }
        window.caplet.processSegmentsConcat(concatParams)
      } else if (allSegments.length === 1 && finalPath) {
        window.caplet.renameFile(allSegments[0], finalPath)
        if (cropParamsStr) {
          window.caplet.processAreaCrop({
            filePath: finalPath,
            cropParams: cropParamsStr
          })
        }
      } else if (cropParamsStr && lastSegmentPath) {
        window.caplet.processAreaCrop({
          filePath: lastSegmentPath,
          cropParams: cropParamsStr
        })
      }

    } catch (error) {
      console.error('[ZapRec] Failed to stop recording silently:', error)
    }
  }).catch(console.error)
}, [setStatus, restorePipState])

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
      if (s === 'recording' || s === 'paused') stopRecording()
      else if (s === 'idle') startRecording()
    })

    const unlistenPause = window.caplet.onShortcutTogglePause(() => {
      const store = useAppStore.getState()
      if (store.status !== 'recording' && store.status !== 'paused') return

      const newPaused = !store.isPaused
      store.setIsPaused(newPaused)
      setStatus(newPaused ? 'paused' : 'recording')

      recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
        if (newPaused) {
          const segmentPath = await recordingEngine.pause()
          await window.caplet.streamEnd()
          if (segmentPath) {
            store.addRecordingSegment(segmentPath)
          }
        } else {
          const nextSegmentPath = recordingEngine.generateNextSegmentPath()
          if (nextSegmentPath) {
            recordingEngine.setFilePath(nextSegmentPath)
            await window.caplet.streamStart(nextSegmentPath)
          }
          await recordingEngine.resume()
        }
      }).catch(console.error)
    })

    const unlistenRecordingStopRequested = window.caplet.onRecordingStopRequested(() => {
      const s = useAppStore.getState().status
      if (s === 'recording' || s === 'paused') {
        stopRecording()
      }
    })

    const unlistenCropFinished = window.caplet.onCropFinished((filePath) => {
      console.log('[ZapRec] Crop finished:', filePath)
      setStatus('idle')
    })

    const unlistenCropFailed = window.caplet.onCropFailed((error) => {
      console.error('[ZapRec] Crop failed:', error)
      setStatus('idle')
    })

    const unlistenConcatFinished = window.caplet.onConcatFinished((filePath) => {
      console.log('[ZapRec] Concat finished:', filePath)
      useAppStore.getState().clearRecordingSegments()
      setStatus('idle')
    })

    const unlistenConcatFailed = window.caplet.onConcatFailed((error) => {
      console.error('[ZapRec] Concat failed:', error)
      useAppStore.getState().clearRecordingSegments()
      setStatus('idle')
    })

    return () => {
      unlistenRecord()
      unlistenPause()
      unlistenRecordingStopRequested()
      unlistenCropFinished()
      unlistenCropFailed()
      unlistenConcatFinished()
      unlistenConcatFailed()
    }
  }, [setLastSavedPath, startRecording, stopRecording, setStatus])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      mediaCapturer.stopAll()
      audioMixer.destroy()
    }
  }, [])

  useEffect(() => {
    const unlisten = window.caplet.onAreaSelectionCancelled(() => {
      useAppStore.getState().setSelectedSource('display')
    })
    return () => unlisten()
  }, [])

  useEffect(() => {
    const unlisten = window.caplet.onCameraPreviewCancelled(() => {
      restorePipState()
    })
    return () => unlisten()
  }, [restorePipState])

  useEffect(() => {
    const unlisten = window.caplet.onCameraSettingsConfirmed((settings) => {
      useAppStore.getState().setPendingCameraSettings(settings)
      useAppStore.getState().setSelectedSource('camera')
      startPreWarming()
      startCountdown()
    })
    return () => unlisten()
  }, [startCountdown])

  useEffect(() => {
    const unlistenWindowSelected = window.caplet.onWindowSelected((windowData) => {
      useAppStore.getState().setSelectedWindow(windowData)
      startPreWarming()
      startCountdown()
    })

    const unlistenWindowCancelled = window.caplet.onWindowSelectionCancelled(() => {
      const store = useAppStore.getState()
      if (store.savedPipEnabled) {
        store.setPipEnabled(true)
      }
      store.setSavedPipEnabled(null)
      store.setPipButtonDisabled(false)
      store.setSelectedSource('display')
    })

    return () => {
      unlistenWindowSelected()
      unlistenWindowCancelled()
    }
  }, [startCountdown, startRecording])

  useEffect(() => {
    const store = useAppStore.getState()
    if (store.status !== 'countdown' || !store.isCountdownFinished) {
      return
    }

    if (store.prepState === 'ready') {
      commitRecording()
    } else if (store.prepState === 'failed') {
      store.setStatus('idle')
    }
  }, [isCountdownFinished, prepState, commitRecording])

  const handleOpenWindowPicker = useCallback(() => {
    useAppStore.getState().setSelectedSource('window')
    window.caplet.startWindowPicker()
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Toolbar
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        isRecording={status === 'recording'}
        onOpenWindowPicker={handleOpenWindowPicker}
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

function WindowPickerForSelectionWindow() {
  const handleSelect = (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => {
    window.caplet.sendWindowSelected(windowData)
  }
  const handleCancel = () => {
    window.caplet.cancelWindowPicker()
  }
  return <WindowPicker onSelect={handleSelect} onCancel={handleCancel} />
}
