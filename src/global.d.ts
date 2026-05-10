export interface ConcatParams {
  segments: string[]
  finalPath: string
  cropParams?: string
}

export interface ScreenAPI {
  getSources: (types: string[]) => Promise<{ id: string; name: string; thumbnail: string; appIcon: string | null }[]>
  getSettings: () => Promise<Record<string, unknown>>
  setSetting: (key: string, value: unknown) => Promise<void>
  settingsLoad: () => Promise<Record<string, unknown>>
  settingsSet: (key: string, value: unknown) => Promise<void>
  settingsReset: () => Promise<Record<string, unknown>>
  streamStart: (filepath: string) => Promise<{ success: boolean }>
  streamWrite: (chunk: Uint8Array) => Promise<{ success: boolean }>
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
  startWindowPicker: () => void
  cancelWindowPicker: () => void
  sendWindowSelected: (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => void
  onWindowSelected: (callback: (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => void) => () => void
  onWindowSelectionCancelled: (callback: () => void) => () => void
  startCameraPreview: () => void
  cancelCameraPreview: () => void
  sendCameraSettingsConfirmed: (settings: { deviceId: string }) => void
  onCameraPreviewCancelled: (callback: () => void) => () => void
  onCameraSettingsConfirmed: (callback: (settings: { deviceId: string }) => void) => () => void
  showCameraWindow: () => void
  closeCameraPreviewWindow: () => void
  onShortcutToggleRecord: (callback: () => void) => () => void
  onShortcutTogglePause: (callback: () => void) => () => void
  onShortcutToggleVisibility: (callback: () => void) => () => void
  onRecordingStopRequested: (callback: () => void) => () => void
  sendRecordingStopped: () => void
  processSegmentsConcat: (params: ConcatParams) => void
  onConcatFinished: (callback: (filePath: string | null) => void) => () => void
  onConcatFailed: (callback: (error: string) => void) => () => void
  processAreaCrop: (params: { filePath: string; cropParams: string }) => void
  onCropFinished: (callback: (filePath: string) => void) => () => void
  onCropFailed: (callback: (error: string) => void) => () => void
  renameFile: (oldPath: string, newPath: string) => void
  openPipWindow: () => void
  closePipWindow: () => void
  onPipClosed: (callback: () => void) => () => void
  openSettings: () => void
  closeSettings: () => void
  showToolbar: () => void
  hideToolbar: () => void
  settingsWindowMinimize: () => void
  onSettingsSync: (callback: (settings: Record<string, unknown>) => void) => () => void
  getAppName: () => Promise<string>
  onPipSizeChanged: (callback: (size: string) => void) => () => void
  onPipShapeChanged: (callback: (shape: string) => void) => () => void
  setPipShape: (shape: 'circle' | 'rectangle') => void
  setPipSize: (size: 'sm' | 'md' | 'lg') => void
  hideCameraWindow: () => void
  requestRecordingStop: () => void
  setCameraSize: (size: 'sm' | 'md' | 'lg') => void
}

declare global {
  interface Window {
    screenApi: ScreenAPI
  }
}