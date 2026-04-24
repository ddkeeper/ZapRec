import { useAppStore } from '../store/useAppStore'
import { mediaCapturer } from '../core/MediaCapturer'
import { audioMixer } from '../core/AudioMixer'
import { recordingEngine } from '../core/RecordingEngine'
import { QUALITY_PRESETS } from '../shared/types'

let prepAbortController: AbortController | null = null
let prepRecordingWidth = 0
let prepRecordingHeight = 0

export const startPreWarming = async () => {
  const store = useAppStore.getState()
  store.setPrepState('preparing')

  prepAbortController = new AbortController()
  const signal = prepAbortController.signal

  try {
    const state = useAppStore.getState()
    const { selectedSource, selectedSourceId, selectedWindow, pendingCameraSettings, pendingAreaSelection, microphoneEnabled, systemAudioEnabled, settings } = state

    const quality = QUALITY_PRESETS[settings.quality]

    if (selectedSource === 'display') {
      const sourceId = selectedSourceId || 'screen:0:0'
      await mediaCapturer.startDisplayCapture(sourceId, quality.width, quality.height)
      if (signal.aborted) throw new Error('CANCELLED')
      const videoTrack = mediaCapturer.getDisplayStream()?.getVideoTracks()[0]
      if (videoTrack) {
        const trackSettings = videoTrack.getSettings()
        prepRecordingWidth = trackSettings.width || quality.width
        prepRecordingHeight = trackSettings.height || quality.height
      }
    } else if (selectedSource === 'window') {
      if (!selectedWindow) throw new Error('No window selected')
      await mediaCapturer.startWindowCapture(selectedWindow.id)
      if (signal.aborted) throw new Error('CANCELLED')
      const videoTrack = mediaCapturer.getDisplayStream()?.getVideoTracks()[0]
      if (videoTrack) {
        const trackSettings = videoTrack.getSettings()
        prepRecordingWidth = trackSettings.width || quality.width
        prepRecordingHeight = trackSettings.height || quality.height
        videoTrack.onended = () => {
          console.warn('[ZapRec] 目标窗口已关闭')
        }
      }
    } else if (selectedSource === 'area') {
      if (!pendingAreaSelection) throw new Error('No area selected')

      const physicalWidth = Math.round(window.screen.width * window.devicePixelRatio)
      const physicalHeight = Math.round(window.screen.height * window.devicePixelRatio)

      await mediaCapturer.startDisplayCapture('screen:0:0', physicalWidth, physicalHeight)
      if (signal.aborted) throw new Error('CANCELLED')
      const videoTrack = mediaCapturer.getDisplayStream()?.getVideoTracks()[0]
      if (videoTrack) {
        const trackSettings = videoTrack.getSettings()
        prepRecordingWidth = trackSettings.width || physicalWidth
        prepRecordingHeight = trackSettings.height || physicalHeight
        if (prepRecordingWidth % 2 !== 0) prepRecordingWidth--
        if (prepRecordingHeight % 2 !== 0) prepRecordingHeight--
      }
    } else if (selectedSource === 'camera') {
      if (!pendingCameraSettings) throw new Error('No camera settings')
      await mediaCapturer.startCameraCapture(microphoneEnabled, pendingCameraSettings.deviceId)
      if (signal.aborted) throw new Error('CANCELLED')
      const videoTrack = mediaCapturer.getDisplayStream()?.getVideoTracks()[0]
      if (videoTrack) {
        const trackSettings = videoTrack.getSettings()
        prepRecordingWidth = trackSettings.width || quality.width
        prepRecordingHeight = trackSettings.height || quality.height
      }
    }

    await audioMixer.initialize()
    if (signal.aborted) throw new Error('CANCELLED')

    const micStream = await mediaCapturer.startMicrophoneCapture()
    if (signal.aborted) throw new Error('CANCELLED')

    audioMixer.addStream(micStream, 'microphone')
    audioMixer.setGain('microphone', microphoneEnabled ? 1 : 0)

    const displayStream = mediaCapturer.getDisplayStream()
    if (displayStream) {
      const audioTracks = displayStream.getAudioTracks()
      if (audioTracks.length > 0 && systemAudioEnabled) {
        const systemStream = new MediaStream([audioTracks[0]])
        audioMixer.addStream(systemStream, 'system')
        audioMixer.setGain('system', 1)
      }
    }

    await audioMixer.resume()
    if (signal.aborted) throw new Error('CANCELLED')

    const videoStreamForEngine = selectedSource === 'camera'
      ? mediaCapturer.getCameraStream()
      : mediaCapturer.getDisplayStream()
    if (videoStreamForEngine) {
      await recordingEngine.initialize(
        { width: prepRecordingWidth, height: prepRecordingHeight, fps: quality.fps },
        () => {}
      )
      recordingEngine.addVideoTrack(videoStreamForEngine, prepRecordingWidth, prepRecordingHeight)
      const mixedStream = audioMixer.getOutputStream()
      if (mixedStream) {
        recordingEngine.addAudioTrack(mixedStream)
      }
    }

    store.setPrepState('ready')
  } catch (e: any) {
    if (e.message !== 'CANCELLED') {
      console.error('[PreWarming] Failed:', e)
      useAppStore.getState().setPrepState('failed')
    }
  }
}

export const cancelPreWarming = () => {
  if (prepAbortController) {
    prepAbortController.abort()
    prepAbortController = null
  }

  const store = useAppStore.getState()
  store.setPrepState('idle')
  store.setStatus('idle')

  mediaCapturer.stopAll()
  audioMixer.destroy()
  recordingEngine.stop()
}

export const getPrepRecordingDimensions = () => ({
  width: prepRecordingWidth,
  height: prepRecordingHeight
})
