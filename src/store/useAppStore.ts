import { create } from 'zustand'
import { AppState, AppSettings, RecordingSource, RecordingStatus, DEFAULT_SETTINGS, CameraSettings } from '../shared/types'

export interface WindowInfo {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
}

interface AppStore extends AppState {
  isSelectingArea: boolean
  pendingAreaSelection: { x: number; y: number; width: number; height: number } | null
  selectedWindow: WindowInfo | null
  pendingCameraSettings: CameraSettings | null
  setIsSelectingArea: (value: boolean) => void
  setPendingAreaSelection: (area: { x: number; y: number; width: number; height: number } | null) => void
  setSelectedWindow: (window: WindowInfo | null) => void
  setPendingCameraSettings: (settings: CameraSettings | null) => void
  setStatus: (status: RecordingStatus) => void
  setSelectedSource: (source: RecordingSource) => void
  setSelectedSourceId: (id: string | null) => void
  toggleMicrophone: () => void
  toggleSystemAudio: () => void
  setMicrophoneEnabled: (enabled: boolean) => void
  setSystemAudioEnabled: (enabled: boolean) => void
  setCameraEnabled: (enabled: boolean) => void
  setSettings: (settings: Partial<AppSettings>) => void
  setCountdownValue: (value: number) => void
  setRecordingDuration: (duration: number) => void
  setLastSavedPath: (path: string | null) => void
  reset: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  isSelectingArea: false,
  pendingAreaSelection: null,
  selectedWindow: null,
  pendingCameraSettings: null,
  status: 'idle',
  selectedSource: 'display',
  selectedSourceId: null,
  microphoneEnabled: false,
  systemAudioEnabled: false,
  cameraEnabled: false,
  settings: DEFAULT_SETTINGS,
  countdownValue: 0,
  recordingDuration: 0,
  lastSavedPath: null,

  setIsSelectingArea: (value: boolean) => set({ isSelectingArea: value }),
  setPendingAreaSelection: (area: { x: number; y: number; width: number; height: number } | null) => set({ pendingAreaSelection: area }),
  setSelectedWindow: (window: WindowInfo | null) => set({ selectedWindow: window }),
  setPendingCameraSettings: (settings: CameraSettings | null) => set({ pendingCameraSettings: settings }),
  setStatus: (status: RecordingStatus) => set({ status }),
  setSelectedSource: (source: RecordingSource) => set({ selectedSource: source }),
  setSelectedSourceId: (id: string | null) => set({ selectedSourceId: id }),
  toggleMicrophone: () => set((state) => ({ microphoneEnabled: !state.microphoneEnabled })),
  toggleSystemAudio: () => set((state) => ({ systemAudioEnabled: !state.systemAudioEnabled })),
  setMicrophoneEnabled: (enabled: boolean) => set({ microphoneEnabled: enabled }),
  setSystemAudioEnabled: (enabled: boolean) => set({ systemAudioEnabled: enabled }),
  setCameraEnabled: (enabled: boolean) => set({ cameraEnabled: enabled }),
  setSettings: (settings: Partial<AppSettings>) => set((state) => ({ 
    settings: { ...state.settings, ...settings } 
  })),
  setCountdownValue: (value: number) => set({ countdownValue: value }),
  setRecordingDuration: (duration: number) => set({ recordingDuration: duration }),
  setLastSavedPath: (path: string | null) => set({ lastSavedPath: path }),
  reset: () => set({
    isSelectingArea: false,
    pendingAreaSelection: null,
    selectedWindow: null,
    pendingCameraSettings: null,
    status: 'idle',
    selectedSource: 'display',
    selectedSourceId: null,
    countdownValue: 0,
    recordingDuration: 0
  })
}))
