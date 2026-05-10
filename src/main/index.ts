import { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, globalShortcut, nativeImage, shell, dialog, protocol, screen, session, systemPreferences } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import ffmpeg from 'fluent-ffmpeg'
import { DISPLAY_NAME } from '../config'

const getFFmpegPath = (): string => {
  const isPacked = app.isPackaged
  
  if (isPacked) {
    return path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe')
  } else {
    return path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
  }
}

ffmpeg.setFfmpegPath(getFFmpegPath())

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================
// GPU tuning parameters - WebCodecs hardware acceleration
// ============================================
app.commandLine.appendSwitch('enable-features', 'WebCodecsVideoEncoderHardwareAcceleration')
app.commandLine.appendSwitch('offscreen-use-shared-texture')
// app.commandLine.appendSwitch('disable-gpu-sandbox') // only enable when old graphics card driver crashes
// ============================================
// Register Secure Context protocol (WebCodecs needs)
// ============================================
protocol.registerSchemesAsPrivileged([
  { scheme: 'screen', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

// Simple JSON file-based settings store
let settingsData: Record<string, unknown> = {}
let settingsLoaded = false

const DEFAULT_SETTINGS_DATA = {
  general: {
    countdownSeconds: 3,
    fps: 60,
    resolution: 'original',
    minimizeToTrayOnClose: true,
  },
  shortcuts: {
    toggleRecord: 'Alt+Shift+R',
    togglePause: 'Alt+Shift+P',
    toggleVisibility: 'Alt+Shift+H',
  },
  storage: {
    saveDirectory: '',
    filenamePrefix: DISPLAY_NAME,
    filenameTemplate: '{app}_{date}_{time}',
  },
  lastState: {
    microphoneEnabled: false,
    systemAudioEnabled: false,
    pipEnabled: false,
  },
}

function getSettingsFilePath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function loadSettings() {
  const filePath = getSettingsFilePath()
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      settingsData = { ...DEFAULT_SETTINGS_DATA, ...JSON.parse(data) }
    } else {
      settingsData = { ...DEFAULT_SETTINGS_DATA }
      settingsData.storage = { saveDirectory: app.getPath('downloads') }
    }
  } catch (e) {
    console.error('[Main] Failed to load settings:', e)
    settingsData = { ...DEFAULT_SETTINGS_DATA }
  }
  settingsLoaded = true
}

function saveSettings() {
  if (!settingsLoaded) return
  const filePath = getSettingsFilePath()
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(settingsData, null, 2), 'utf-8')
  } catch (e) {
    console.error('[Main] Failed to save settings:', e)
  }
}

// Simple in-memory store instead of electron-store
const store: Record<string, unknown> = {}

let mainWindow: BrowserWindow | null = null
let selectionWindow: BrowserWindow | null = null
let windowPickerWindow: BrowserWindow | null = null
let cameraPreviewWindow: BrowserWindow | null = null
let cameraRecordingWindow: BrowserWindow | null = null
let cameraPreviewConfirming = false
let currentCameraDeviceId = ''
let pipWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let writeStream: fs.WriteStream | null = null

const CAMERA_SIZES = {
  sm: 140,
  md: 200,
  lg: 300
}
let currentCameraSizeTier: 'sm' | 'md' | 'lg' = 'md'

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

// Icon path (use scripts/build in dev, resources directory in production)
function getIconPath(size?: number): string {
  const isDev = !!VITE_DEV_SERVER_URL
  const basePath = isDev 
    ? path.join(__dirname, '../../scripts/build')
    : path.join(process.resourcesPath, 'build')
  
  if (size) {
    return path.join(basePath, `icon-${size}x${size}.png`)
  }
  return path.join(basePath, 'icon.png')
}

function createWindow() {
  // 获取应用图标
  const iconPath = getIconPath(256)
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 64,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,  // 仅在托盘显示，隐藏任务栏图标
    backgroundColor: '#00000000',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (VITE_DEV_SERVER_URL) {
    console.log('[Screen] Loading from dev server:', VITE_DEV_SERVER_URL)
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
      console.error('[Screen] Failed to load:', errorCode, errorDescription)
    })
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('[Screen] Finished loading')
    })
    mainWindow.webContents.on('console-message', (_, level, message) => {
      const levels = ['verbose', 'info', 'warning', 'error']
      console.log(`[Renderer ${levels[level]}]:`, message)
    })
    mainWindow.webContents.on('render-process-gone', (_, details) => {
      console.error('[Screen] Renderer process gone:', details)
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('close', () => {
    // Cascade lifecycle management: destroy all child windows when main window closes
    destroyWindowPickerWindow()
    destroyPipWindow()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

let tray: Tray | null = null
let currentAppState = { status: 'idle', source: 'display' }

function updateTrayIcon() {
  if (!tray) return
  const isRecording = currentAppState.status === 'recording' || currentAppState.status === 'paused'
  const iconName = isRecording ? 'icon-16x16-red.png' : 'icon-16x16.png'
  
  let iconPath = getIconPath(16).replace('icon-16x16.png', iconName)
  let icon: Electron.NativeImage
  
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  } else {
    // Fallback base64 or default icon
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADASURBVDiNpdMxSgNBHAbgb7OFYGFhIVhYWFhYWIiFhVhYiIWFYGFhYWEhFhYWYiEWYiEWPjAw8IGm8WKz2WQ0+5LP7M7M+76ZNdmHGGMSIAXmQB44AAfgCnyAh5AHtoAFUACOgD3wDLyAHbCVS1D4bCWWs1R6zSUoAiZJkvRP4l+BEnAFXoE7sAYWwBBYAH1x+8fCJXCWe/y9gB1wA+5S10dRFPX+KqkHiA8f4i+Bd+AFrIJgPQdawBVYAs/AB9gFG2AN7CXJ7gP0B5e8y2b+4Q7kAQAAAABJRU5ErkJggg==')
  }
  
  tray.setImage(icon)
}

function updateTrayMenu() {
  console.log('[Main] updateTrayMenu called, currentAppState:', currentAppState)
  if (!tray) return

  const isIdle = currentAppState.status === 'idle'
  const isRecording = currentAppState.status === 'recording'
  const isPaused = currentAppState.status === 'paused'
  const isCameraMode = currentAppState.source === 'camera'

  let startPauseLabel = '开始录制'
  if (isRecording) startPauseLabel = '暂停'
  if (isPaused) startPauseLabel = '继续'

  const contextMenu = Menu.buildFromTemplate([
    {
      label: startPauseLabel,
      click: () => {
        if (isIdle) {
          mainWindow?.webContents.send('shortcut:toggle-record')
        } else {
          mainWindow?.webContents.send('shortcut:toggle-pause')
        }
      }
    },
    {
      label: '停止录制',
      enabled: !isIdle,
      click: () => {
        mainWindow?.webContents.send('shortcut:toggle-record')
      }
    },
    {
      label: '显示小窗',
      visible: isCameraMode && !isIdle,
      click: () => {
        if (cameraRecordingWindow && !cameraRecordingWindow.isDestroyed()) {
          if (cameraRecordingWindow.isVisible()) {
            cameraRecordingWindow.focus()
          } else {
            const win = cameraRecordingWindow
            win.setOpacity(0)
            win.showInactive()
            setTimeout(() => {
              win.setOpacity(1)
            }, 20)
          }
        }
      }
    },
    {
      label: '设置',
      click: () => {
        ipcMain.emit('open-settings')
      }
    },
    {
      label: '打开主面板',
      click: () => {
        showToolbar()
      }
    },
    {
      label: '退出',
      click: () => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)
}

function createTray() {
  const iconPath = getIconPath(16)  // 托盘使用 16x16 图标
  let icon: Electron.NativeImage
  
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  } else {
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADASURBVDiNpdMxSgNBHAbgb7OFYGFhIVhYWFhYWIiFhVhYiIWFYGFhYWEhFhYWYiEWYiEWPjAw8IGm8WKz2WQ0+5LP7M7M+76ZNdmHGGMSIAXmQB44AAfgCnyAh5AHtoAFUACOgD3wDLyAHbCVS1D4bCWWs1R6zSUoAiZJkvRP4l+BEnAFXoE7sAYWwBBYAH1x+8fCJXCWe/y9gB1wA+5S10dRFPX+KqkHiA8f4i+Bd+AFrIJgPQdawBVYAs/AB9gFG2AN7CXJ7gP0B5e8y2b+4Q7kAQAAAABJRU5ErkJggg==')
  }
  
  tray = new Tray(icon)

  tray.setToolTip(DISPLAY_NAME)
  
  updateTrayMenu()
  
  tray.on('click', () => {
    showToolbar()
  })
}

function registerShortcuts() {
  const shortcutsData = (settingsData as any).shortcuts || {}
  const toggleRecordKey = shortcutsData.toggleRecord || 'Alt+Shift+R'
  const togglePauseKey = shortcutsData.togglePause || 'Alt+Shift+P'
  const toggleVisibilityKey = shortcutsData.toggleVisibility || 'Alt+Shift+H'
  
  globalShortcut.register(toggleRecordKey, () => {
    mainWindow?.webContents.send('shortcut:toggle-record')
  })
  
  globalShortcut.register(togglePauseKey, () => {
    mainWindow?.webContents.send('shortcut:toggle-pause')
  })
  
  globalShortcut.register(toggleVisibilityKey, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        const win = mainWindow!
        win.setOpacity(0)
        win.showInactive()
        setTimeout(() => {
          win.setOpacity(1)
        }, 20)
      }
    }
  })
}

function updateShortcuts() {
  globalShortcut.unregisterAll()
  registerShortcuts()
}

ipcMain.handle('get-sources', async (_, types: string[]) => {
  const sources = await desktopCapturer.getSources({
    types: types as ('screen' | 'window')[],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  })
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    display_id: source.display_id,
    appIcon: source.appIcon?.toDataURL() || null
  }))
})

ipcMain.handle('get-settings', () => {
  return store
})

ipcMain.handle('set-setting', (_, key: string, value: unknown) => {
  store[key] = value
})

ipcMain.handle('get-app-name', () => {
  return app.getName()
})

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('settings-load', () => {
  return settingsData
})

ipcMain.handle('settings-set', (_, key: string, value: unknown) => {
  const keys = key.split('.')
  if (keys.length === 2) {
    ;(settingsData as any)[keys[0]] = {
      ...(settingsData as any)[keys[0]],
      [keys[1]]: value
    }
  } else {
    settingsData[key] = value
  }
  saveSettings()
  
  if (key.startsWith('shortcuts.')) {
    updateShortcuts()
  }
  
  mainWindow?.webContents.send('settings-sync', settingsData)
})

ipcMain.handle('settings-reset', () => {
  settingsData = { ...DEFAULT_SETTINGS_DATA }
  settingsData.storage = { saveDirectory: app.getPath('downloads') }
  saveSettings()
  return settingsData
})

ipcMain.handle('get-recordings', async (_, dirPath: string) => {
  try {
    const files = fs.readdirSync(dirPath)
    const recordings = files
      .filter(f => f.endsWith('.mp4'))
      .map(f => {
        const filePath = path.join(dirPath, f)
        const stats = fs.statSync(filePath)
        return {
          id: f,
          name: f,
          path: filePath,
          size: stats.size,
          sizeFormatted: formatFileSize(stats.size),
          date: stats.mtime.toISOString()
        }
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return recordings
  } catch {
    return []
  }
})

ipcMain.handle('delete-recordings', async (_, filePaths: string[]) => {
  for (const filePath of filePaths) {
    try {
      fs.unlinkSync(filePath)
    } catch (e) {
      console.error('[Main] Failed to delete:', filePath, e)
    }
  }
  return { success: true }
})

ipcMain.handle('open-in-folder', (_, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.on('open-settings', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createSettingsWindow()
})

ipcMain.on('close-settings', () => {
  destroySettingsWindow()
  setTimeout(() => {
    showToolbar()
  }, 50)
})

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window-maximize', () => {
  if (settingsWindow) {
    if (settingsWindow.isMaximized()) {
      settingsWindow.unmaximize()
    } else {
      settingsWindow.maximize()
    }
  } else {
    // 工具条窗口不需要最大化，只显示窗口
    showToolbar()
  }
})

ipcMain.handle('settings-window-minimize', () => {
  settingsWindow?.minimize()
})

ipcMain.handle('window-close', () => {
  mainWindow?.close()
})

ipcMain.on('resize-toolbar', (_, { width, height }) => {
  if (mainWindow) {
    mainWindow.setSize(width, height)
  }
})

ipcMain.on('update-app-state', (_, state: { status: string; source: string }) => {
  console.log('[Main] update-app-state received:', state)
  currentAppState = state
  updateTrayMenu()
  updateTrayIcon()
})

ipcMain.handle('stream-start', async (_, filepath: string) => {
  try {
    const dir = path.dirname(filepath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    writeStream = fs.createWriteStream(filepath)
    console.log('[Main] Stream started:', filepath)
    return { success: true }
  } catch (error) {
    console.error('Failed to start stream:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('stream-write', async (_, chunk: Uint8Array) => {
  const stream = writeStream
  if (stream) {
    const buffer = Buffer.from(chunk)
    stream.write(buffer)
    return { success: true }
  }
  return { success: false, error: 'No active stream' }
})

ipcMain.handle('stream-end', async () => {
  console.log('[Main] Stream ending...')
  return new Promise((resolve) => {
    if (writeStream) {
      writeStream.end(() => {
        console.log('[Main] Stream ended successfully')
        writeStream = null
        resolve({ success: true })
      })
    } else {
      console.log('[Main] No active stream to end')
      resolve({ success: false, error: 'No active stream' })
    }
  })
})

ipcMain.on('rename-file', (_, { oldPath, newPath }: { oldPath: string, newPath: string }) => {
  try {
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath)
      console.log('[Main] File renamed:', oldPath, '->', newPath)
    }
  } catch (err) {
    console.error('[Main] Failed to rename file:', err)
  }
})

ipcMain.handle('show-item-in-folder', (_, filepath: string) => {
  shell.showItemInFolder(filepath)
})

ipcMain.handle('get-default-save-path', () => {
  return app.getPath('downloads')
})

function createSelectionWindow() {
  if (selectionWindow) {
    selectionWindow.close()
  }

  const rawUrl = mainWindow?.webContents.getURL() || ''
  const baseUrl = rawUrl.split('#')[0]
  const selectionUrl = `${baseUrl}#/area-selection`

  // Get primary display coordinates and size, avoid scaling hotzones in fullscreen mode
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds

  selectionWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    movable: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    // Key: toolbar type window doesn't have standard border in Windows, avoid edge-triggered scaling    type: 'toolbar',
    // Lock min/max sizes, completely block system-level resize determination
    minWidth: width,
    maxWidth: width,
    minHeight: height,
    maxHeight: height,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.platform === 'darwin') {
    selectionWindow.setWindowButtonVisibility(false)
  }

  // 再次通过 API 强制锁定
  selectionWindow.setResizable(false)
  selectionWindow.setMovable(false)
  
  // Pure and clean: force selection/shadow overlay to alwaysOnTop='screen-saver' level, higher than normal windows  selectionWindow.setAlwaysOnTop(true, 'screen-saver')

  selectionWindow.loadURL(selectionUrl)

  // Ultimate fix: completely block Windows fullscreen borderless window edge-triggered scaling light arrow
  if (process.platform === 'win32') {
    selectionWindow.hookWindowMessage(0x0084, (_e, result) => {
      // 0x0084 = WM_NCHITTEST
      // HTCLIENT = 1, tell system this is normal client area, not border, no scaling arrow
      result.writeInt32LE(1, 0)
      return true // Block Electron from handling this message
    })
  }

  selectionWindow.on('closed', () => {
    selectionWindow = null
  })
}

function destroySelectionWindow() {
  if (selectionWindow) {
    selectionWindow.setOpacity(0)
    selectionWindow.setIgnoreMouseEvents(true)
    selectionWindow.setAlwaysOnTop(false)

    const winToDestroy = selectionWindow
    selectionWindow = null

    setTimeout(() => {
      if (!winToDestroy.isDestroyed()) {
        winToDestroy.destroy()
      }
    }, 100)
  }
}

// ============================================
// Window picker independent window
// ============================================
function createWindowPickerWindow() {
  if (windowPickerWindow) {
    windowPickerWindow.close()
  }

  const rawUrl = mainWindow?.webContents.getURL() || ''
  const baseUrl = rawUrl.split('#')[0]
  const pickerUrl = `${baseUrl}#/window-picker`

  const { x, y, width, height } = screen.getPrimaryDisplay().bounds

  windowPickerWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    movable: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    type: 'toolbar',
    minWidth: width,
    maxWidth: width,
    minHeight: height,
    maxHeight: height,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  windowPickerWindow.setResizable(false)
  windowPickerWindow.setMovable(false)
  windowPickerWindow.setAlwaysOnTop(true, 'screen-saver')

  windowPickerWindow.loadURL(pickerUrl)

  if (process.platform === 'win32') {
    windowPickerWindow.hookWindowMessage(0x0084, (_e, result) => {
      result.writeInt32LE(1, 0)
      return true
    })
  }

  windowPickerWindow.on('closed', () => {
    windowPickerWindow = null
  })
}

function destroyWindowPickerWindow() {
  if (windowPickerWindow) {
    windowPickerWindow.close()
    windowPickerWindow = null
  }
}

// ============================================
// Camera preview independent window
// ============================================
function createCameraPreviewWindow() {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
  }

  const { x, y, width, height } = screen.getPrimaryDisplay().bounds

  cameraPreviewWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    movable: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  cameraPreviewWindow.setResizable(false)
  cameraPreviewWindow.setAspectRatio(16 / 9)
  cameraPreviewWindow.setAlwaysOnTop(true, 'screen-saver')

  if (VITE_DEV_SERVER_URL) {
    cameraPreviewWindow.loadURL(`${VITE_DEV_SERVER_URL.replace('/index.html', '')}/camera-preview.html`)
  } else {
    cameraPreviewWindow.loadFile(path.join(__dirname, '../../dist/camera-preview.html'))
  }

  cameraPreviewWindow.on('closed', () => {
    const wasConfirming = cameraPreviewConfirming
    cameraPreviewWindow = null
    cameraPreviewConfirming = false
    if (!wasConfirming && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('camera-preview-cancelled')
    }
  })
}

// ============================================
// 画中画悬浮n/ ============================================
const PIP_SIZES = {
  sm: 140,
  md: 200,
  lg: 300
}

let currentShape: 'rectangle' | 'circle' = 'rectangle'
let currentSize: 'sm' | 'md' | 'lg' = 'md'

function updatePipBounds(sizeTier: 'sm' | 'md' | 'lg') {
  if (!pipWindow) return

  const baseHeight = PIP_SIZES[sizeTier]
  const bounds = pipWindow.getBounds()

  let newWidth: number
  let newHeight: number

  if (currentShape === 'circle') {
    pipWindow.setAspectRatio(1)
    newWidth = baseHeight
    newHeight = baseHeight
  } else {
    pipWindow.setAspectRatio(16 / 9)
    newHeight = baseHeight
    newWidth = Math.round(baseHeight * (16 / 9))
  }

  pipWindow.setBounds({
    x: Math.round(bounds.x + (bounds.width - newWidth) / 2),
    y: Math.round(bounds.y + (bounds.height - newHeight) / 2),
    width: newWidth,
    height: newHeight
  })
}

function createPipWindow() {
  if (pipWindow) return

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  const initialWidth = Math.round(PIP_SIZES.md * (16 / 9))
  const initialHeight = PIP_SIZES.md

  pipWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: screenWidth - initialWidth - 50,
    y: screenHeight - initialHeight - 50,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  pipWindow.setAspectRatio(16 / 9)
  pipWindow.setAlwaysOnTop(true, 'screen-saver')

  if (VITE_DEV_SERVER_URL) {
    pipWindow.loadURL(`${VITE_DEV_SERVER_URL.replace('/index.html', '')}/pip-window.html`)
  } else {
    pipWindow.loadFile(path.join(__dirname, '../../dist/pip-window.html'))
  }

  if (VITE_DEV_SERVER_URL) {
    pipWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
      console.error('[PipWindow] Failed to load:', errorCode, errorDescription)
    })
    pipWindow.webContents.on('console-message', (_, level, message) => {
      const levels = ['verbose', 'info', 'warning', 'error']
      console.log(`[PipWindow Renderer ${levels[level]}]:`, message)
    })
    pipWindow.webContents.on('render-process-gone', (_, details) => {
      console.error('[PipWindow] Render process gone:', details)
    })
  }

  pipWindow.on('closed', () => {
    pipWindow = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pip-closed')
    }
  })
}

function destroyPipWindow() {
  if (pipWindow) {
    pipWindow.close()
    pipWindow = null
  }
}

// ============================================
// Window picker IPC
// ============================================
ipcMain.on('start-window-picker', () => {
  console.log('[Main] start-window-picker received')
  if (mainWindow) {
    mainWindow.hide()
  }
  createWindowPickerWindow()
})

ipcMain.on('cancel-window-picker', () => {
  console.log('[Main] cancel-window-picker received')
  destroyWindowPickerWindow()
  showToolbar()
  mainWindow?.webContents.send('window-selection-cancelled')
})

ipcMain.on('window-selected', (_, windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => {
  console.log('[Main] window-selected received:', windowData.name)
  destroyWindowPickerWindow()
  showToolbar()
  mainWindow?.webContents.send('window-selected', windowData)
})

// ============================================
// Settings Window
// ============================================
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show()
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore()
    }
    settingsWindow.focus()
    return
  }

  const iconPath = getIconPath(256)

  settingsWindow = new BrowserWindow({
    width: 800,
    height: 560,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    skipTaskbar: false,
    backgroundColor: '#ffffff',
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(`${VITE_DEV_SERVER_URL.replace('/index.html', '')}/settings.html`)
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../../dist/settings.html'))
  }

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function destroySettingsWindow() {
  if (settingsWindow) {
    settingsWindow.close()
    settingsWindow = null
  }
}

// ============================================
// Camera preview IPC
// ============================================
ipcMain.on('start-camera-preview', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createCameraPreviewWindow()
})

ipcMain.on('cancel-camera-preview', () => {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
  }
  showToolbar()
})

ipcMain.on('camera-settings-confirmed', (_, settings: { deviceId: string }) => {
  cameraPreviewConfirming = true
  currentCameraDeviceId = settings.deviceId
  showToolbar()
  mainWindow?.webContents.send('camera-settings-confirmed', settings)
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
    cameraPreviewWindow = null
  }
})

ipcMain.on('set-camera-size', (_, sizeTier: 'sm' | 'md' | 'lg') => {
  if (!cameraRecordingWindow) return
  currentCameraSizeTier = sizeTier
  const h = CAMERA_SIZES[sizeTier]
  const w = Math.round(h * (16 / 9))
  const bounds = cameraRecordingWindow.getBounds()
  cameraRecordingWindow.setBounds({
    x: Math.round(bounds.x + (bounds.width - w) / 2),
    y: Math.round(bounds.y + (bounds.height - h) / 2),
    width: w,
    height: h
  })
})

ipcMain.on('hide-camera-window', () => {
  if (cameraRecordingWindow) {
    cameraRecordingWindow.hide()
  }
})

function showToolbar() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isVisible()) {
      mainWindow.focus()
    } else {
      const win = mainWindow
      win.setOpacity(0)
      win.showInactive()
      setTimeout(() => {
        win.setOpacity(1)
      }, 20)
    }
  }
}

function hideToolbar() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide()
  }
}

ipcMain.on('show-toolbar', showToolbar)
ipcMain.on('hide-toolbar', hideToolbar)

ipcMain.on('show-camera-window', () => {
  if (cameraRecordingWindow) return

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const h = CAMERA_SIZES[currentCameraSizeTier]
  const w = Math.round(h * (16 / 9))

  cameraRecordingWindow = new BrowserWindow({
    width: w,
    height: h,
    x: screenW - w - 50,
    y: screenH - h - 50,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  cameraRecordingWindow.setAspectRatio(16 / 9)
  cameraRecordingWindow.setAlwaysOnTop(true, 'screen-saver')

  const pagePath = 'camera-preview.html'
  const query = `?mode=recording&deviceId=${encodeURIComponent(currentCameraDeviceId)}`

  if (VITE_DEV_SERVER_URL) {
    cameraRecordingWindow.loadURL(`${VITE_DEV_SERVER_URL.replace('/index.html', '')}/${pagePath}${query}`)
  } else {
    cameraRecordingWindow.loadFile(path.join(__dirname, `../../dist/${pagePath}`), { search: query })
  }

  cameraRecordingWindow.on('closed', () => {
    cameraRecordingWindow = null
  })
})

ipcMain.on('close-camera-preview-window', () => {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
    cameraPreviewWindow = null
  }
  if (cameraRecordingWindow) {
    cameraRecordingWindow.close()
    cameraRecordingWindow = null
  }
})

// ============================================
// Picture-in-picture IPC
// ============================================
ipcMain.on('open-pip', () => {
  createPipWindow()
})

ipcMain.on('close-pip', () => {
  destroyPipWindow()
})

ipcMain.on('set-pip-shape', (_, shape: 'circle' | 'rectangle') => {
  currentShape = shape
  updatePipBounds(currentSize)
  pipWindow?.webContents.send('pip-shape-changed', shape)
})

ipcMain.on('set-pip-size', (_, size: 'sm' | 'md' | 'lg') => {
  currentSize = size
  updatePipBounds(size)
  pipWindow?.webContents.send('pip-size-changed', size)
})


// ============================================

ipcMain.on('start-area-selection', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createSelectionWindow()
})

ipcMain.on('area-selected', (_, area: { x: number; y: number; width: number; height: number }) => {
  if (selectionWindow) {
    selectionWindow.setIgnoreMouseEvents(true)
    selectionWindow.setAlwaysOnTop(true, 'screen-saver')
    selectionWindow.webContents.send('switch-to-recording-visuals')
  }

  showToolbar()
  mainWindow?.webContents.send('area-selected', area)
})

ipcMain.on('cancel-area-selection', () => {
  destroySelectionWindow()
  showToolbar()
  mainWindow?.webContents.send('area-selection-cancelled')
})

ipcMain.on('recording-stopped', () => {
  destroySelectionWindow()
})

ipcMain.on('request-recording-stop', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-stop-requested')
  }
})

ipcMain.on('process-area-crop', async (event, { filePath, cropParams }) => {
  const dir = path.dirname(filePath) || ''
  const ext = path.extname(filePath)
  const basename = path.basename(filePath, ext)
  const tempFilePath = path.join(dir, `${basename}_temp_crop${ext}`)

  try {
    ffmpeg(filePath)
      .videoFilters(`crop=${cropParams}`)
      .outputOptions([
        '-c:v libx264',
        '-preset veryfast',
        '-crf 17',
        '-pix_fmt yuv420p',
        '-c:a copy'
      ])
      .save(tempFilePath)
      .on('end', () => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
        fs.renameSync(tempFilePath, filePath)
        event.reply('crop-finished', filePath)
      })
      .on('error', (err) => {
        event.reply('crop-failed', err.message)
      })
  } catch (err) {
    console.error('[Screen] FFmpeg execution error:', err)
  }
})

app.whenReady().then(() => {
  // Auto-grant camera and microphone permissions
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
    } else {
      callback(false)
    }
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'media') {
      return true
    }
    return false
  })

  // macOS 请求系统权限
  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('camera').then((granted) => {
      console.log('[Main] Camera access granted:', granted)
    })
    systemPreferences.askForMediaAccess('microphone').then((granted) => {
      console.log('[Main] Microphone access granted:', granted)
    })
  }

  createWindow()
  createTray()
  loadSettings()
  registerShortcuts()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

ipcMain.on('process-segments-concat', async (event, { segments, finalPath, cropParams }: { segments: string[], finalPath: string, cropParams?: string }) => {
  if (!segments || segments.length === 0) {
    event.reply('concat-finished', null)
    return
  }

  const dir = path.dirname(finalPath)
  const listFilePath = path.join(dir, `concat_list_${Date.now()}.txt`)

  const fileContent = segments
    .map((p: string) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')

  fs.writeFileSync(listFilePath, fileContent)

  const cmd = ffmpeg()
    .input(listFilePath)
    .inputOptions(['-f concat', '-safe 0'])

  if (cropParams) {
    cmd.videoFilters(`crop=${cropParams}`)
      .outputOptions([
        '-c:v libx264',
        '-preset veryfast',
        '-crf 17',
        '-pix_fmt yuv420p',
        '-c:a copy'
      ])
  } else {
    cmd.outputOptions(['-c copy'])
  }

  cmd.save(finalPath)
    .on('start', (cmdStr: string) => console.log('[FFmpeg] Concat started:', cmdStr))
    .on('end', () => {
      segments.forEach((p: string) => { if (fs.existsSync(p)) fs.unlinkSync(p) })
      if (fs.existsSync(listFilePath)) fs.unlinkSync(listFilePath)
      console.log('[FFmpeg] Concat finished:', finalPath)
      event.reply('concat-finished', finalPath)
    })
    .on('error', (err: Error) => {
      console.error('[FFmpeg] Concat failed:', err)
      event.reply('concat-failed', err.message)
    })
})
