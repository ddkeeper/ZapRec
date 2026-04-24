const { contextBridge, ipcRenderer } = require('electron')

const api = {
  getSources: (types: string[]) => ipcRenderer.invoke('get-sources', types),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('set-setting', key, value),
  streamStart: (filepath: string) => ipcRenderer.invoke('stream-start', filepath),
  streamWrite: (chunk: Uint8Array) => ipcRenderer.invoke('stream-write', chunk),
  streamEnd: () => ipcRenderer.invoke('stream-end'),
  showItemInFolder: (filepath: string) => ipcRenderer.invoke('show-item-in-folder', filepath),
  getDefaultSavePath: () => ipcRenderer.invoke('get-default-save-path'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  resizeToolbar: (width: number, height: number) => ipcRenderer.send('resize-toolbar', { width, height }),

  startAreaSelection: () => ipcRenderer.send('start-area-selection'),
  cancelAreaSelection: () => ipcRenderer.send('cancel-area-selection'),
  sendAreaSelected: (area: { x: number; y: number; width: number; height: number }) => ipcRenderer.send('area-selected', area),
  
  onAreaSelected: (callback: (area: { x: number; y: number; width: number; height: number }) => void) => {
    const handler = (_: unknown, area: { x: number; y: number; width: number; height: number }) => callback(area)
    ipcRenderer.on('area-selected', handler)
    return () => ipcRenderer.removeListener('area-selected', handler)
  },
  onAreaSelectionCancelled: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('area-selection-cancelled', handler)
    return () => ipcRenderer.removeListener('area-selection-cancelled', handler)
  },
  
  onSwitchToRecordingVisuals: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('switch-to-recording-visuals', handler)
    return () => ipcRenderer.removeListener('switch-to-recording-visuals', handler)
  },
  
  sendRecordingStopped: () => ipcRenderer.send('recording-stopped'),
  requestRecordingStop: () => ipcRenderer.send('request-recording-stop'),

  onRecordingStopRequested: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('recording-stop-requested', handler)
    return () => ipcRenderer.removeListener('recording-stop-requested', handler)
  },

  onShortcutToggleRecord: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:toggle-record', handler)
    return () => ipcRenderer.removeListener('shortcut:toggle-record', handler)
  },
  onShortcutTogglePause: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:toggle-pause', handler)
    return () => ipcRenderer.removeListener('shortcut:toggle-pause', handler)
  },

  startWindowPicker: () => ipcRenderer.send('start-window-picker'),
  cancelWindowPicker: () => ipcRenderer.send('cancel-window-picker'),
  sendWindowSelected: (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => {
    ipcRenderer.send('window-selected', windowData)
  },
  
  onWindowSelected: (callback: (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => void) => {
    const handler = (_: unknown, windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => callback(windowData)
    ipcRenderer.on('window-selected', handler)
    return () => ipcRenderer.removeListener('window-selected', handler)
  },
  onWindowSelectionCancelled: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('window-selection-cancelled', handler)
    return () => ipcRenderer.removeListener('window-selection-cancelled', handler)
  },

  startCameraPreview: () => ipcRenderer.send('start-camera-preview'),
  cancelCameraPreview: () => ipcRenderer.send('cancel-camera-preview'),
  sendCameraSettingsConfirmed: (settings: { deviceId: string }) => {
    ipcRenderer.send('camera-settings-confirmed', settings)
  },
  
  onCameraSettingsConfirmed: (callback: (settings: { deviceId: string }) => void) => {
    const handler = (_: unknown, settings: { deviceId: string }) => callback(settings)
    ipcRenderer.on('camera-settings-confirmed', handler)
    return () => ipcRenderer.removeListener('camera-settings-confirmed', handler)
  },
  onCameraPreviewCancelled: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('camera-preview-cancelled', handler)
    return () => ipcRenderer.removeListener('camera-preview-cancelled', handler)
  },

  setCameraPreviewMode: (mode: 'preview' | 'recording') => ipcRenderer.send('set-camera-preview-mode', mode),
  closeCameraPreviewWindow: () => ipcRenderer.send('close-camera-preview-window'),
  setCameraSize: (size: 'sm' | 'md' | 'lg') => ipcRenderer.send('set-camera-size', size),
  hideCameraWindow: () => ipcRenderer.send('hide-camera-window'),
  showCameraWindow: () => ipcRenderer.send('show-camera-window'),

  onCameraPreviewModeChanged: (callback: (mode: 'preview' | 'recording') => void) => {
    const handler = (_: unknown, mode: 'preview' | 'recording') => callback(mode)
    ipcRenderer.on('camera-preview-mode-changed', handler)
    return () => ipcRenderer.removeListener('camera-preview-mode-changed', handler)
  },

  onCameraPreviewDestroyStream: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('camera-preview-destroy-stream', handler)
    return () => ipcRenderer.removeListener('camera-preview-destroy-stream', handler)
  },

  onCameraWindowShow: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('camera-window-show', handler)
    return () => ipcRenderer.removeListener('camera-window-show', handler)
  },

  openPipWindow: () => ipcRenderer.send('open-pip'),
  closePipWindow: () => ipcRenderer.send('close-pip'),
  setPipShape: (shape: 'circle' | 'rectangle') => ipcRenderer.send('set-pip-shape', shape),
  setPipSize: (size: 'sm' | 'md' | 'lg') => ipcRenderer.send('set-pip-size', size),

  onPipClosed: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('pip-closed', handler)
    return () => ipcRenderer.removeListener('pip-closed', handler)
  },

  onPipSizeChanged: (callback: (size: 'sm' | 'md' | 'lg') => void) => {
    const handler = (_: unknown, size: 'sm' | 'md' | 'lg') => callback(size)
    ipcRenderer.on('pip-size-changed', handler)
    return () => ipcRenderer.removeListener('pip-size-changed', handler)
  },

  onPipShapeChanged: (callback: (shape: 'circle' | 'rectangle') => void) => {
    const handler = (_: unknown, shape: 'circle' | 'rectangle') => callback(shape)
    ipcRenderer.on('pip-shape-changed', handler)
    return () => ipcRenderer.removeListener('pip-shape-changed', handler)
  },

  processAreaCrop: (params: { filePath: string; cropParams: string }) => ipcRenderer.send('process-area-crop', params),
  
  onCropFinished: (callback: (filePath: string) => void) => {
    const handler = (_: unknown, filePath: string) => callback(filePath)
    ipcRenderer.on('crop-finished', handler)
    return () => ipcRenderer.removeListener('crop-finished', handler)
  },
  
  onCropFailed: (callback: (error: string) => void) => {
    const handler = (_: unknown, error: string) => callback(error)
    ipcRenderer.on('crop-failed', handler)
    return () => ipcRenderer.removeListener('crop-failed', handler)
  },

  processSegmentsConcat: (params: { segments: string[], finalPath: string, cropParams?: string }) => ipcRenderer.send('process-segments-concat', params),

  onConcatFinished: (callback: (filePath: string | null) => void) => {
    const handler = (_: unknown, filePath: string | null) => callback(filePath)
    ipcRenderer.on('concat-finished', handler)
    return () => ipcRenderer.removeListener('concat-finished', handler)
  },

  onConcatFailed: (callback: (error: string) => void) => {
    const handler = (_: unknown, error: string) => callback(error)
    ipcRenderer.on('concat-failed', handler)
    return () => ipcRenderer.removeListener('concat-failed', handler)
  },

  renameFile: (oldPath: string, newPath: string) => ipcRenderer.send('rename-file', { oldPath, newPath })
}

contextBridge.exposeInMainWorld('caplet', api)
