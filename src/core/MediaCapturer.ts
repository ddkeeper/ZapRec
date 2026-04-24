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
      resizeToolbar: (width: number, height: number) => void
      startAreaSelection: () => void
      cancelAreaSelection: () => void
      sendAreaSelected: (area: { x: number; y: number; width: number; height: number }) => void
      onAreaSelected: (callback: (area: { x: number; y: number; width: number; height: number }) => void) => () => void
      onAreaSelectionCancelled: (callback: () => void) => () => void
      onSwitchToRecordingVisuals: (callback: () => void) => () => void
      sendRecordingStopped: () => void
      requestRecordingStop: () => void
      onRecordingStopRequested: (callback: () => void) => () => void
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
      setCameraPreviewMode: (mode: 'preview' | 'recording') => void
      closeCameraPreviewWindow: () => void
      setCameraSize: (size: 'sm' | 'md' | 'lg') => void
      hideCameraWindow: () => void
      showCameraWindow: () => void
      onCameraPreviewModeChanged: (callback: (mode: 'preview' | 'recording') => void) => () => void
      onCameraPreviewDestroyStream: (callback: () => void) => () => void
      onCameraWindowShow: (callback: () => void) => () => void
      openPipWindow: () => void
      closePipWindow: () => void
      setPipShape: (shape: 'circle' | 'rectangle') => void
      setPipSize: (size: 'sm' | 'md' | 'lg') => void
      onPipClosed: (callback: () => void) => () => void
      onPipSizeChanged: (callback: (size: 'sm' | 'md' | 'lg') => void) => () => void
      onPipShapeChanged: (callback: (shape: 'circle' | 'rectangle') => void) => () => void
      processAreaCrop: (params: { filePath: string; cropParams: string }) => void
      onCropFinished: (callback: (filePath: string) => void) => () => void
      onCropFailed: (callback: (error: string) => void) => () => void
      processSegmentsConcat: (params: { segments: string[], finalPath: string }) => void
      onConcatFinished: (callback: (filePath: string | null) => void) => () => void
      onConcatFailed: (callback: (error: string) => void) => () => void
      renameFile: (oldPath: string, newPath: string) => void
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

async startDisplayCapture(
    sourceId: string,
    width?: number,
    height?: number
  ): Promise<MediaStream> {
    this.stopDisplayCapture()
    
    const maxWidth = width || 1920
    const maxHeight = height || 1080

    const constraints: MediaStreamConstraints = {
      audio: { mandatory: { chromeMediaSource: 'desktop' } } as MediaTrackConstraints,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth,
          maxHeight
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
      audio: { mandatory: { chromeMediaSource: 'desktop' } } as MediaTrackConstraints,
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
        autoGainControl: true,
        sampleRate: 48000,
        googNoiseSuppression2: true,
        googHighpassFilter: false,
        googTypingNoiseDetection: false
      } as any,
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

  getCameraStream(): MediaStream | null {
    return this.cameraStream
  }
}

export const mediaCapturer = new MediaCapturer()
