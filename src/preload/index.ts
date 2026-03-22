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
  }
}

contextBridge.exposeInMainWorld('caplet', api)
