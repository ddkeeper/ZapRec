import { DesktopSource, CameraSettings } from '../shared/types'

declare global {
  interface Window {
    caplet: {
      getSources: (types: string[]) => Promise<DesktopSource[]>
      getSettings: () => Promise<Record<string, unknown>>
      setSetting: (key: string, value: unknown) => Promise<void>
      streamStart: (filepath: string) => Promise<{ success: boolean; error?: string }>
      streamWrite: (chunk: Uint8Array) => Promise<{ success: boolean; error?: string }>
      streamEnd: () => Promise<{ success: boolean; error?: string }>
      showItemInFolder: (filepath: string) => Promise<void>
      getDefaultSavePath: () => Promise<string>
      selectDirectory: () => Promise<string | null>
      windowMinimize: () => Promise<void>
      windowClose: () => Promise<void>
      startAreaSelection: () => void
      cancelAreaSelection: () => void
      sendAreaSelected: (area: { x: number; y: number; width: number; height: number }) => void
      onAreaSelected: (callback: (area: { x: number; y: number; width: number; height: number }) => void) => () => void
      onAreaSelectionCancelled: (callback: () => void) => () => void
      onSwitchToRecordingVisuals: (callback: () => void) => () => void
      sendRecordingStopped: () => void
      onShortcutToggleRecord: (callback: () => void) => () => void
      onShortcutTogglePause: (callback: () => void) => () => void
      startWindowPicker: () => void
      cancelWindowPicker: () => void
      sendWindowSelected: (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => void
      onWindowSelected: (callback: (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => void) => () => void
      onWindowSelectionCancelled: (callback: () => void) => () => void
      startCameraPreview: () => void
      cancelCameraPreview: () => void
      sendCameraSettingsConfirmed: (settings: CameraSettings) => void
      onCameraSettingsConfirmed: (callback: (settings: CameraSettings) => void) => () => void
      onCameraPreviewCancelled: (callback: () => void) => () => void
    }
  }
}

export interface CaptureOptions {
  sourceId: string
  video: boolean
  audio: boolean
  audioSource?: 'user' | 'desktop'
}

export interface WindowInfo {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
}

export class MediaCapturer {
  private displayStream: MediaStream | null = null
  private microphoneStream: MediaStream | null = null
  private cameraStream: MediaStream | null = null
  private targetWindowId: string | null = null
  
  async getDisplaySources(): Promise<DesktopSource[]> {
    return window.caplet.getSources(['screen', 'window'])
  }

  async getCameraSources(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(device => device.kind === 'videoinput')
  }

  async getMicrophoneSources(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(device => device.kind === 'audioinput')
  }

  async startDisplayCapture(sourceId: string): Promise<MediaStream> {
    this.stopDisplayCapture()
    
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: 1280,
          maxWidth: 3840,
          minHeight: 720,
          maxHeight: 2160
        }
      } as MediaTrackConstraints
    }

    this.displayStream = await navigator.mediaDevices.getUserMedia(constraints)
    return this.displayStream
  }

  async startWindowCapture(windowId: string): Promise<MediaStream> {
    this.stopDisplayCapture()
    this.targetWindowId = windowId

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: windowId
        }
      } as MediaTrackConstraints
    }

    this.displayStream = await navigator.mediaDevices.getUserMedia(constraints)
    return this.displayStream
  }

  getTargetWindowId(): string | null {
    return this.targetWindowId
  }

  clearTargetWindowId(): void {
    this.targetWindowId = null
  }

  async startMicrophoneCapture(): Promise<MediaStream> {
    this.stopMicrophoneCapture()
    
    this.microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000
      },
      video: false
    })
    
    return this.microphoneStream
  }

  async startCameraCapture(audio: boolean = false, deviceId?: string): Promise<MediaStream> {
    this.stopCameraCapture()
    
    const videoConstraints: MediaTrackConstraints = {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 }
    }
    
    this.cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: audio,
      video: videoConstraints
    })
    
    return this.cameraStream
  }

  stopDisplayCapture(): void {
    if (this.displayStream) {
      this.displayStream.getTracks().forEach(track => track.stop())
      this.displayStream = null
    }
  }

  stopMicrophoneCapture(): void {
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach(track => track.stop())
      this.microphoneStream = null
    }
  }

  stopCameraCapture(): void {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop())
      this.cameraStream = null
    }
  }

  stopAll(): void {
    this.stopDisplayCapture()
    this.stopMicrophoneCapture()
    this.stopCameraCapture()
    this.targetWindowId = null
  }

  getDisplayStream(): MediaStream | null {
    return this.displayStream
  }

  getMicrophoneStream(): MediaStream | null {
    return this.microphoneStream
  }
}

export const mediaCapturer = new MediaCapturer()
