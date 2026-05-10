import { useEffect, useState, useRef, useCallback } from 'react'
import { useAppStore } from './store/useAppStore'
import Toolbar from './components/Toolbar'
import AreaOverlay, { type AreaSelection } from './components/AreaOverlay'
import WindowPicker from './components/WindowPicker'
import CameraPreviewOverlay from './components/CameraPreviewOverlay'
import { mediaCapturer } from './core/MediaCapturer'
import { audioMixer } from './core/AudioMixer'
import { recordingEngine } from './core/RecordingEngine'
import { startPreWarming, cancelPreWarming, getPrepRecordingDimensions } from './core/recordingPreWarming'
import { type CameraSettings } from './types'
import { useRecordingCountdown } from './hooks/useRecordingCountdown'
import { usePipSync } from './hooks/usePipSync'
import type { ConcatParams } from '../global'
import { APP_NAME } from '../config'

function App() {
  const isAreaSelectionMode = window.location.hash === '#/area-selection'
  const isCameraPreviewMode = window.location.hash === '#/camera-preview'
  const isWindowPickerMode = window.location.hash === '#/window-picker'

  if (isCameraPreviewMode) {
    const screenApi = window.screenApi as any
    return <CameraPreviewOverlay
      onConfirm={(settings: CameraSettings) => screenApi.sendCameraSettingsConfirmed(settings)}
      onCancel={() => screenApi.cancelCameraPreview()}
    />
  }

  if (isAreaSelectionMode) {
    return <AreaOverlayForSelectionWindow />
  }

  if (isWindowPickerMode) {
    return <WindowPickerForSelectionWindow />
  }

  const { setLastSavedPath, status, setStatus, isCountdownFinished, prepState, selectedSource } = useAppStore()
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
      
      const template = settings.filenameTemplate || '{app}_{date}_{time}'
      const now = new Date()
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`
      const appName = APP_NAME
      const filename = template.replace(/{app}/g, appName).replace(/{date}/g, dateStr).replace(/{time}/g, timeStr)
      const outputDir = settings.outputDirectory || defaultPath || ''
      const filepath = `${outputDir}/${filename}.mp4`

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
      await window.screenApi.streamStart(part1Path)
      setLastSavedPath(filepath)

      await recordingEngine.start()

      if (selectedSource === 'camera') {
        window.screenApi.showCameraWindow()
        if (settings.autoHide) {
          await window.screenApi.windowMinimize()
        }
      } else {
        if (settings.autoHide) {
          window.screenApi.windowMinimize()
        }
      }

      setStatus('recording')
    } catch (error) {
      console.error('[Screen] Failed to commit recording:', error)
      useAppStore.getState().setStatus('idle')
    }
  }, [defaultPath, setLastSavedPath, setStatus])

const startRecording = useCallback(async () => {
    const state = useAppStore.getState()
    if (state.isStopping) return

    const screenApi = window.screenApi as any
    const settings = await screenApi.settingsLoad()
    settingsRef.current = settings
    
    console.log('[App] Recording settings:', JSON.stringify(settings?.storage))
    
    const currentSource = state.selectedSource
    const currentSourceId = state.selectedSourceId
    const currentSettings = state.settings
    const microphoneEnabled = state.microphoneEnabled
    const systemAudioEnabled = state.systemAudioEnabled
    
    const fps = currentSettings.fps ?? settings?.general?.fps ?? 60
    const resolution = currentSettings.resolution ?? settings?.general?.resolution ?? 'original'
    
    const outputDir = currentSettings.outputDirectory || defaultPath || ''
    
    const template = currentSettings.filenameTemplate || '{app}_{date}_{time}'
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`
    const appName = APP_NAME
    const filename = template.replace(/{app}/g, appName).replace(/{date}/g, dateStr).replace(/{time}/g, timeStr)
    const filepath = `${outputDir}/${filename}.mp4`

    const part1Path = recordingEngine.initializePaths(filepath)
    await screenApi.streamStart(part1Path)

    let displayStream: MediaStream | null = null
    const dpr = window.devicePixelRatio
    let recordingWidth = resolution === '1080P' ? 1920 : Math.round(window.screen.width * dpr)
    let recordingHeight = resolution === '1080P' ? 1080 : Math.round(window.screen.height * dpr)

    if (currentSource === 'display') {
      const sourceId = currentSourceId || 'screen:0:0'
      displayStream = await mediaCapturer.startDisplayCapture(sourceId, recordingWidth, recordingHeight, fps)
      displayStreamRef.current = displayStream

      const videoTrack = displayStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.applyConstraints({
          width: { ideal: recordingWidth },
          height: { ideal: recordingHeight },
          frameRate: { ideal: fps }
        })
      }

    } else if (currentSource === 'window') {
      const windowInfo = state.selectedWindow
      if (!windowInfo) {
        console.error('[Screen] Window mode but no window selected')
        recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
          await window.screenApi.streamEnd()
        }).catch(console.error)
        setStatus('idle')
        return
      }
      displayStream = await mediaCapturer.startWindowCapture(windowInfo.id, recordingWidth, recordingHeight, fps)
      displayStreamRef.current = displayStream

      const videoTrack = displayStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.onended = () => {
          console.warn('[Screen] 目标窗口已关闭，自动停止并保存录制')
          stopRecording()
        }
      }

    } else if (currentSource === 'camera') {
      const pendingSettings = state.pendingCameraSettings
      if (!pendingSettings) {
        console.error('[Screen] Camera mode but no pending settings')
        recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
          await window.screenApi.streamEnd()
        }).catch(console.error)
        restorePipState()
        setStatus('idle')
        return
      }

      displayStream = await mediaCapturer.startCameraCapture(microphoneEnabled, pendingSettings.deviceId)
      displayStreamRef.current = displayStream

      const videoTrack = displayStream.getVideoTracks()[0]
      if (videoTrack) {
        console.log(`[Screen] 摄像头录制就绪，预设分辨率: ${recordingWidth}x${recordingHeight}`)
        useAppStore.getState().setPendingCameraSettings(null)
      } else {
        console.error('[Screen] 无法获取摄像头视频轨道')
        recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
          await window.screenApi.streamEnd()
        }).catch(console.error)
        restorePipState()
        setStatus('idle')
        return
      }

    } else if (currentSource === 'area') {
      const pendingArea = state.pendingAreaSelection
      if (!pendingArea) {
        console.error('[Screen] Area mode but no pending area selection')
        recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
          await window.screenApi.streamEnd()
        }).catch(console.error)
        setStatus('idle')
        return
      }

      const rawStream = await mediaCapturer.startDisplayCapture('screen:0:0', undefined, undefined, fps)
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
      console.error('[Screen] No display stream available')
      recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
        await window.screenApi.streamEnd()
      }).catch(console.error)
      setStatus('idle')
      return
    }

    await recordingEngine.initialize(
      { width: recordingWidth, height: recordingHeight, fps },
      () => {}
    )

    recordingEngine.addVideoTrack(displayStream, recordingWidth, recordingHeight, fps)

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
          console.warn('[Screen] System audio stream was empty or failed to add to mixer.')
        }
      } else if (systemAudioEnabled) {
        console.warn('[Screen] Expected system audio but no audio tracks found in display stream.')
      }
    }

    const micStream = await mediaCapturer.startMicrophoneCapture()
    micStreamRef.current = micStream
    const isMicAdded = audioMixer.addStream(micStream, 'microphone')
    if (isMicAdded) {
      audioMixer.setGain('microphone', microphoneEnabled ? 1 : 0)
    } else {
      console.warn('[Screen] Microphone stream was empty or failed to add to mixer.')
    }

    await audioMixer.resume()

    const mixedStream = audioMixer.getOutputStream()
    if (mixedStream && mixedStream.getAudioTracks().length > 0) {
      recordingEngine.addAudioTrack(mixedStream)
    }

    await recordingEngine.start()

    setLastSavedPath(filepath)

    if (currentSource === 'camera') {
      window.screenApi.showCameraWindow()
      if (currentSettings.autoHide) {
        await window.screenApi.windowMinimize()
      }
    }

    setStatus('recording')

    if (currentSettings.autoHide) {
      window.screenApi.windowMinimize()
    }

  }, [defaultPath, setStatus, setLastSavedPath, restorePipState])

const stopRecording = useCallback(() => {
  const store = useAppStore.getState()
  if (store.isStopping) return

  const wasCameraMode = store.selectedSource === 'camera'
  const wasAreaMode = store.selectedSource === 'area'
  const savedPip = store.savedPipEnabled
  const cropArea = store.activeCropArea
  const currentSegments = [...store.recordingSegments]

  if (timerRef.current) {
    clearInterval(timerRef.current)
    timerRef.current = null
  }

  store.setIsStopping(true)
  store.reset()
  setStatus('idle')

  if (wasCameraMode) {
    window.screenApi.closeCameraPreviewWindow()
    if (savedPip) {
      restorePipState()
    }
  }

  recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
    try {
      const lastSegmentPath = await recordingEngine.stopAndSave()
      await window.screenApi.streamEnd()
      window.screenApi.sendRecordingStopped()

      const allSegments = [...currentSegments, lastSegmentPath].filter(Boolean) as string[]
      const finalPath = recordingEngine.getBaseFilePath()

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
        window.screenApi.processSegmentsConcat(concatParams)
      } else if (allSegments.length === 1 && finalPath) {
        window.screenApi.renameFile(allSegments[0], finalPath)
        if (cropParamsStr) {
          window.screenApi.processAreaCrop({
            filePath: finalPath,
            cropParams: cropParamsStr
          })
        }
      } else if (cropParamsStr && lastSegmentPath) {
        window.screenApi.processAreaCrop({
          filePath: lastSegmentPath,
          cropParams: cropParamsStr
        })
      }

    } catch (error) {
      console.error('[Screen] Failed to stop recording silently:', error)
    } finally {
      store.setIsStopping(false)
    }
  }).catch(console.error)
}, [setStatus, restorePipState])

  useEffect(() => {
    const loadDefaultPath = async () => {
      try {
        const p = await window.screenApi.getDefaultSavePath()
        setDefaultPath(p)
        setLastSavedPath(p)
      } catch (error) {
        console.error('[Screen] Failed to load default save path:', error)
      }
    }
    loadDefaultPath()

    const unlistenRecord = (window.screenApi as any).onShortcutToggleRecord(async () => {
      const s = useAppStore.getState().status
      if (s === 'recording' || s === 'paused') {
        (window.screenApi as any).showToolbar?.();
        stopRecording()
      } else if (s === 'idle') {
        (window.screenApi as any).showToolbar?.();
        (window.screenApi as any).settingsWindowMinimize?.();
        useAppStore.getState().setSelectedSource('display')
        startPreWarming()
        startCountdown()
      }
    })

    const unlistenPause = window.screenApi.onShortcutTogglePause(() => {
      const store = useAppStore.getState()
      if (store.status !== 'recording' && store.status !== 'paused') return

      (window.screenApi as any).showToolbar?.()
      const newPaused = !store.isPaused
      store.setIsPaused(newPaused)
      setStatus(newPaused ? 'paused' : 'recording')

      recordingEngine.taskQueue = recordingEngine.taskQueue.then(async () => {
        if (newPaused) {
          const segmentPath = await recordingEngine.pause()
          await window.screenApi.streamEnd()
          if (segmentPath) {
            store.addRecordingSegment(segmentPath)
          }
        } else {
          const nextSegmentPath = recordingEngine.generateNextSegmentPath()
          if (nextSegmentPath) {
            recordingEngine.setFilePath(nextSegmentPath)
            await window.screenApi.streamStart(nextSegmentPath)
          }
          await recordingEngine.resume()
          ;(window.screenApi as any).hideToolbar?.()
        }
      }).catch(console.error)
    })

    const unlistenVisibility = (window.screenApi as any).onShortcutToggleVisibility(async () => {
      const store = useAppStore.getState()
      const s = store.status
      
      if (s === 'recording' || s === 'paused' || s === 'idle') {
        (window.screenApi as any).showToolbar?.()
        (window.screenApi as any).settingsWindowMinimize?.()
      }
    })

    const unlistenRecordingStopRequested = window.screenApi.onRecordingStopRequested(() => {
      const s = useAppStore.getState().status
      if (s === 'recording' || s === 'paused') {
        (window.screenApi as any).showToolbar?.()
        stopRecording()
      }
    })

    const unlistenCropFinished = window.screenApi.onCropFinished((filePath) => {
      console.log('[Screen] Crop finished:', filePath)
      setStatus('idle')
    })

    const unlistenCropFailed = window.screenApi.onCropFailed((error) => {
      console.error('[Screen] Crop failed:', error)
      setStatus('idle')
    })

    const unlistenConcatFinished = window.screenApi.onConcatFinished((filePath) => {
      console.log('[Screen] Concat finished:', filePath)
      useAppStore.getState().clearRecordingSegments()
      setStatus('idle')
    })

    const unlistenConcatFailed = window.screenApi.onConcatFailed((error) => {
      console.error('[Screen] Concat failed:', error)
      useAppStore.getState().clearRecordingSegments()
      setStatus('idle')
    })

    return () => {
      unlistenRecord()
      unlistenPause()
      unlistenVisibility()
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

  const settingsRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    const unlistenSettingsSync = (window.screenApi as any).onSettingsSync((settings: any) => {
      settingsRef.current = settings
      const general = settings?.general
      const shortcuts = settings?.shortcuts
      const storage = settings?.storage
      if (general || shortcuts || storage) {
        useAppStore.getState().setSettings({
          ...(general ? { 
            fps: general.fps,
            resolution: general.resolution
          } : {}),
          ...(storage ? { 
            outputDirectory: storage.saveDirectory,
            filenameTemplate: storage.filenameTemplate || '{app}_{date}_{time}'
          } : {}),
        } as any)
      }
    })
    return () => unlistenSettingsSync()
  }, [])

  useEffect(() => {
    const screenApi = window.screenApi as any
    if (screenApi && screenApi.updateAppState) {
      screenApi.updateAppState({
        status: status,
        source: selectedSource
      })
    }
  }, [status, selectedSource])

  useEffect(() => {
    const unlisten = window.screenApi.onAreaSelectionCancelled(() => {
      const store = useAppStore.getState()
      if (store.prepState === 'preparing' || store.prepState === 'ready') {
        cancelPreWarming()
      }
      useAppStore.getState().setSelectedSource('display')
    })
    return () => unlisten()
  }, [])

  useEffect(() => {
    const unlisten = window.screenApi.onCameraPreviewCancelled(() => {
      const store = useAppStore.getState()
      if (store.prepState === 'preparing' || store.prepState === 'ready') {
        cancelPreWarming()
      }
      restorePipState()
    })
    return () => unlisten()
  }, [restorePipState])

  useEffect(() => {
    const unlisten = window.screenApi.onCameraSettingsConfirmed((settings) => {
      useAppStore.getState().setPendingCameraSettings(settings)
      useAppStore.getState().setSelectedSource('camera')
      startPreWarming()
      startCountdown()
    })
    return () => unlisten()
  }, [startCountdown])

  useEffect(() => {
    const unlistenWindowSelected = window.screenApi.onWindowSelected((windowData) => {
      console.log('[App] onWindowSelected received:', windowData.name)
      useAppStore.getState().setSelectedWindow(windowData)
      startPreWarming()
      startCountdown()
    })

    const unlistenWindowCancelled = window.screenApi.onWindowSelectionCancelled(() => {
      console.log('[App] onWindowSelectionCancelled received')
      const store = useAppStore.getState()
      if (store.prepState === 'preparing' || store.prepState === 'ready') {
        cancelPreWarming()
      }
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
    window.screenApi.startWindowPicker()
  }, [])

  return (
    <div className="w-max h-max overflow-hidden pointer-events-none flex items-start justify-start">
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
    window.screenApi.sendAreaSelected(area)
  }
  const handleCancel = () => {
    window.screenApi.cancelAreaSelection()
  }
  return <AreaOverlay onConfirm={handleConfirm} onCancel={handleCancel} />
}

function WindowPickerForSelectionWindow() {
  const handleSelect = (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => {
    window.screenApi.sendWindowSelected(windowData)
  }
  const handleCancel = () => {
    window.screenApi.cancelWindowPicker()
  }
  return <WindowPicker onSelect={handleSelect} onCancel={handleCancel} />
}
