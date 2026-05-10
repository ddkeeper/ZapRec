import { create } from 'zustand'
import { AppState, AppSettings, RecordingSource, RecordingStatus, DEFAULT_SETTINGS, CameraSettings } from '../types'

export interface WindowInfo {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
}

export interface ActiveCropArea {
  x: number
  y: number
  width: number
  height: number
  scaleX: number
  scaleY: number
}

interface AppStore extends AppState {
  isSelectingArea: boolean
  pendingAreaSelection: { x: number; y: number; width: number; height: number } | null
  activeCropArea: ActiveCropArea | null
  selectedWindow: WindowInfo | null
  pendingCameraSettings: CameraSettings | null
  pipButtonDisabled: boolean
  savedPipEnabled: boolean | null
  prepState: 'idle' | 'preparing' | 'ready' | 'failed'
  setPrepState: (state: 'idle' | 'preparing' | 'ready' | 'failed') => void
  isStopping: boolean
  setIsStopping: (stopping: boolean) => void
  setIsSelectingArea: (value: boolean) => void
  setPendingAreaSelection: (area: { x: number; y: number; width: number; height: number } | null) => void
  setActiveCropArea: (area: ActiveCropArea | null) => void
  setSelectedWindow: (window: WindowInfo | null) => void
  setPendingCameraSettings: (settings: CameraSettings | null) => void
  setStatus: (status: RecordingStatus) => void
  setSelectedSource: (source: RecordingSource) => void
  setSelectedSourceId: (id: string | null) => void
  toggleMicrophone: () => void
  toggleSystemAudio: () => void
  setMicrophoneEnabled: (enabled: boolean) => void
  setSystemAudioEnabled: (enabled: boolean) => void
  setPipEnabled: (enabled: boolean) => void
  setPipButtonDisabled: (disabled: boolean) => void
  setSavedPipEnabled: (enabled: boolean | null) => void
  setSettings: (settings: Partial<AppSettings>) => void
  setCountdownValue: (value: number) => void
  setRecordingDuration: (duration: number) => void
  setLastSavedPath: (path: string | null) => void
  isCountdownFinished: boolean
  setIsCountdownFinished: (finished: boolean) => void
  isPaused: boolean
  setIsPaused: (paused: boolean) => void
  recordingSegments: string[]
  addRecordingSegment: (path: string) => void
  clearRecordingSegments: () => void
  reset: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  isSelectingArea: false,
  pendingAreaSelection: null,
  activeCropArea: null,
  selectedWindow: null,
  pendingCameraSettings: null,
  pipButtonDisabled: false,
  savedPipEnabled: null,
  status: 'idle',
  selectedSource: 'display',
  selectedSourceId: null,
  microphoneEnabled: false,
  systemAudioEnabled: false,
  pipEnabled: false,
  settings: DEFAULT_SETTINGS,
  countdownValue: 0,
  recordingDuration: 0,
  lastSavedPath: null,
  prepState: 'idle',
  isStopping: false,
  isCountdownFinished: false,
  isPaused: false,
  recordingSegments: [],

  setIsSelectingArea: (value: boolean) => set({ isSelectingArea: value }),
  setPrepState: (state) => set({ prepState: state }),
  setIsStopping: (stopping) => set({ isStopping: stopping }),
  setPendingAreaSelection: (area: { x: number; y: number; width: number; height: number } | null) => set({ pendingAreaSelection: area }),
  setActiveCropArea: (area: ActiveCropArea | null) => set({ activeCropArea: area }),
  setSelectedWindow: (window: WindowInfo | null) => set({ selectedWindow: window }),
  setPendingCameraSettings: (settings: CameraSettings | null) => set({ pendingCameraSettings: settings }),
  setStatus: (status: RecordingStatus) => set({ status }),
  setSelectedSource: (source: RecordingSource) => set({ selectedSource: source }),
  setSelectedSourceId: (id: string | null) => set({ selectedSourceId: id }),
  toggleMicrophone: () => set((state) => ({ microphoneEnabled: !state.microphoneEnabled })),
  toggleSystemAudio: () => set((state) => ({ systemAudioEnabled: !state.systemAudioEnabled })),
  setMicrophoneEnabled: (enabled: boolean) => set({ microphoneEnabled: enabled }),
  setSystemAudioEnabled: (enabled: boolean) => set({ systemAudioEnabled: enabled }),
  setPipEnabled: (enabled: boolean) => set({ pipEnabled: enabled }),
  setPipButtonDisabled: (disabled: boolean) => set({ pipButtonDisabled: disabled }),
  setSavedPipEnabled: (enabled: boolean | null) => set({ savedPipEnabled: enabled }),
  setSettings: (settings: Partial<AppSettings>) => set((state) => ({
    settings: { ...state.settings, ...settings }
  })),
  setCountdownValue: (value: number) => set({ countdownValue: value }),
  setIsCountdownFinished: (finished: boolean) => set({ isCountdownFinished: finished }),
  setIsPaused: (paused: boolean) => set({ isPaused: paused }),
  setRecordingDuration: (duration: number) => set({ recordingDuration: duration }),
  setLastSavedPath: (path: string | null) => set({ lastSavedPath: path }),
  addRecordingSegment: (path: string) => set((state) => ({ 
    recordingSegments: [...state.recordingSegments, path] 
  })),
  clearRecordingSegments: () => set({ recordingSegments: [] }),
reset: () => set({
    isSelectingArea: false,
    pendingAreaSelection: null,
    activeCropArea: null,
    selectedWindow: null,
    pendingCameraSettings: null,
    pipButtonDisabled: false,
    savedPipEnabled: null,
    status: 'idle',
    selectedSource: 'display',
    selectedSourceId: null,
    countdownValue: 0,
    recordingDuration: 0,
    prepState: 'idle',
    isStopping: false,
    isCountdownFinished: false,
    isPaused: false,
    recordingSegments: []
  })
}))
