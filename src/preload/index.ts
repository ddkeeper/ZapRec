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
  }
}

contextBridge.exposeInMainWorld('caplet', api)
