import { create } from 'zustand'
import { AppState, AppSettings, RecordingSource, RecordingStatus, DEFAULT_SETTINGS } from '../shared/types'

interface AppStore extends AppState {
  isSelectingArea: boolean
  pendingAreaSelection: { x: number; y: number; width: number; height: number } | null
  setIsSelectingArea: (value: boolean) => void
  setPendingAreaSelection: (area: { x: number; y: number; width: number; height: number } | null) => void
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

  setIsSelectingArea: (value) => set({ isSelectingArea: value }),
  setPendingAreaSelection: (area) => set({ pendingAreaSelection: area }),
  setStatus: (status) => set({ status }),
  setSelectedSource: (source) => set({ selectedSource: source }),
  setSelectedSourceId: (id) => set({ selectedSourceId: id }),
  toggleMicrophone: () => set((state) => ({ microphoneEnabled: !state.microphoneEnabled })),
  toggleSystemAudio: () => set((state) => ({ systemAudioEnabled: !state.systemAudioEnabled })),
  setMicrophoneEnabled: (enabled) => set({ microphoneEnabled: enabled }),
  setSystemAudioEnabled: (enabled) => set({ systemAudioEnabled: enabled }),
  setCameraEnabled: (enabled) => set({ cameraEnabled: enabled }),
  setSettings: (settings) => set((state) => ({ 
    settings: { ...state.settings, ...settings } 
  })),
  setCountdownValue: (value) => set({ countdownValue: value }),
  setRecordingDuration: (duration) => set({ recordingDuration: duration }),
  setLastSavedPath: (path) => set({ lastSavedPath: path }),
  reset: () => set({
    isSelectingArea: false,
    pendingAreaSelection: null,
    status: 'idle',
    selectedSource: 'display',
    selectedSourceId: null,
    countdownValue: 0,
    recordingDuration: 0
  })
}))
