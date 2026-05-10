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

export type RecordingStatus = 'idle' | 'countdown' | 'recording' | 'paused' | 'processing'

export interface AppSettings {
  outputDirectory: string
  showNotification: boolean
  countdown: number
  autoHide: boolean
  shortcutStartStop: string
  shortcutPause: string
  filenameTemplate: string
  fps: number
  resolution: 'original' | '1080P'
}

export interface AppState {
  status: RecordingStatus
  selectedSource: RecordingSource
  selectedSourceId: string | null
  microphoneEnabled: boolean
  systemAudioEnabled: boolean
  pipEnabled: boolean
  settings: AppSettings
  countdownValue: number
  recordingDuration: number
  lastSavedPath: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  outputDirectory: '',
  showNotification: true,
  countdown: 3,
  autoHide: true,
  shortcutStartStop: 'CommandOrControl+Shift+R',
  shortcutPause: 'CommandOrControl+Shift+P',
  filenameTemplate: '{app}_{date}_{time}',
  fps: 60,
  resolution: 'original'
}
