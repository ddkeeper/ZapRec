export interface DesktopSource {
  id: string
  name: string
  thumbnail: string
  display_id: string
  appIcon: string | null
}

export interface CameraSettings {
  deviceId: string
}

export type RecordingSource = 'display' | 'window' | 'area' | 'camera'

export type RecordingQuality = '720p' | '1080p' | '1080p60'

export type RecordingStatus = 'idle' | 'countdown' | 'recording' | 'paused'

export interface AppSettings {
  quality: RecordingQuality
  outputDirectory: string
  showNotification: boolean
  countdown: number
  autoHide: boolean
  shortcutStartStop: string
  shortcutPause: string
}

export interface AppState {
  status: RecordingStatus
  selectedSource: RecordingSource
  selectedSourceId: string | null
  microphoneEnabled: boolean
  systemAudioEnabled: boolean
  cameraEnabled: boolean
  settings: AppSettings
  countdownValue: number
  recordingDuration: number
  lastSavedPath: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  quality: '1080p',
  outputDirectory: '',
  showNotification: true,
  countdown: 3,
  autoHide: true,
  shortcutStartStop: 'CommandOrControl+Shift+R',
  shortcutPause: 'CommandOrControl+Shift+P'
}

export const QUALITY_PRESETS = {
  '720p': { width: 1280, height: 720, fps: 30 },
  '1080p': { width: 1920, height: 1080, fps: 30 },
  '1080p60': { width: 1920, height: 1080, fps: 60 }
}
