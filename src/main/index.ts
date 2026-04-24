import { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, globalShortcut, nativeImage, shell, dialog, protocol, screen, session, systemPreferences } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import ffmpeg from 'fluent-ffmpeg'

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
// GPU 调优参数 - WebCodecs 硬件加速
// ============================================
app.commandLine.appendSwitch('enable-features', 'WebCodecsVideoEncoderHardwareAcceleration')
app.commandLine.appendSwitch('offscreen-use-shared-texture')
// app.commandLine.appendSwitch('disable-gpu-sandbox') // 仅在老旧显卡驱动崩溃时启用

// ============================================
// 注册 Secure Context 协议 (WebCodecs 需要)
// ============================================
protocol.registerSchemesAsPrivileged([
  { scheme: 'caplet', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

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
let tray: Tray | null = null
let writeStream: fs.WriteStream | null = null

const CAMERA_SIZES = {
  sm: 140,
  md: 200,
  lg: 300
}
let currentCameraSizeTier: 'sm' | 'md' | 'lg' = 'md'

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

// 图标路径（开发环境使用 scripts/build，生产环境使用资源目录）
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
    console.log('[ZapRec] Loading from dev server:', VITE_DEV_SERVER_URL)
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
      console.error('[ZapRec] Failed to load:', errorCode, errorDescription)
    })
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('[ZapRec] Finished loading')
    })
    mainWindow.webContents.on('console-message', (_, level, message) => {
      const levels = ['verbose', 'info', 'warning', 'error']
      console.log(`[Renderer ${levels[level]}]:`, message)
    })
    mainWindow.webContents.on('render-process-gone', (_, details) => {
      console.error('[ZapRec] Renderer process gone:', details)
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('close', () => {
    // 级联生命周期管理：主窗口关闭时同步销毁所有附属窗口
    destroySelectionWindow()
    destroyWindowPickerWindow()
    destroyPipWindow()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  const iconPath = getIconPath(16)  // 托盘使用 16x16 图标
  let icon: Electron.NativeImage
  
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  } else {
    // 回退到内联的简单图标
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADASURBVDiNpdMxSgNBHAbgb7OFYGFhIVhYWFhYWIiFhVhYiIWFYGFhYWEhFhYWYiEWYiEWPjAw8IGm8WKz2WQ0+5LP7M7M+76ZNdmHGGMSIAXmQB44AAfgCnyAh5AHtoAFUACOgD3wDLyAHbCVS1D4bCWWs1R6zSUoAiZJkvRP4l+BEnAFXoE7sAYWwBBYAH1x+8fCJXCWe/y9gB1wA+5S10dRFPX+KqkHiA8f4i+Bd+AFrIJgPQdawBVYAs/AB9gFG2AN7CXJ7gP0B5e8y2b+4Q7kAQAAAABJRU5ErkJggg==')
  }
  
  tray = new Tray(icon)

  tray.setToolTip('ZapRec')
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => mainWindow?.show() },
    { label: '显示摄像头小窗', click: () => {
      if (cameraRecordingWindow && !cameraRecordingWindow.isVisible()) {
        cameraRecordingWindow.show()
      }
    }},
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
  
  tray.setContextMenu(contextMenu)
  
  tray.on('click', () => {
    mainWindow?.show()
  })
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    mainWindow?.webContents.send('shortcut:toggle-record')
  })
  
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    mainWindow?.webContents.send('shortcut:toggle-pause')
  })
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

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window-close', () => {
  mainWindow?.close()
})

ipcMain.on('resize-toolbar', (_, { width, height }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSize(width, height)
  }
})

function createSelectionWindow() {
  if (selectionWindow) {
    selectionWindow.close()
  }

  const rawUrl = mainWindow?.webContents.getURL() || ''
  const baseUrl = rawUrl.split('#')[0]
  const selectionUrl = `${baseUrl}#/area-selection`

  // 获取主显示器的物理坐标和尺寸，避免 fullscreen 模式下系统注入的缩放热区
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
    // 关键：toolbar 类型窗口在 Windows 下不具备标准边框交互，避免边缘触发缩放
    type: 'toolbar',
    // 锁死最大最小尺寸，彻底阻止系统层面的 resize 判定
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
  
  // 极简与纯净：强制将选区/阴影幕布提升到比普通 alwaysOnTop 更高的 'screen-saver' 层级，
  // 确保它绝对不会被新打开的应用窗口覆盖而导致阴影失效。
  selectionWindow.setAlwaysOnTop(true, 'screen-saver')

  selectionWindow.loadURL(selectionUrl)

  // 终极修复：彻底禁用 Windows 下全屏无边框窗口边缘触发的缩放光标
  if (process.platform === 'win32') {
    selectionWindow.hookWindowMessage(0x0084, (_e, result) => {
      // 0x0084 = WM_NCHITTEST
      // HTCLIENT = 1，告诉系统这是普通客户区，不是边框，不会出现缩放箭头
      result.writeInt32LE(1, 0)
      return true // 阻止 Electron 继续处理这个消息
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
// 窗口选择器独立窗口
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
// 摄像头预览独立窗口
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
// 画中画悬浮窗
// ============================================
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
// 窗口选择器 IPC
// ============================================
ipcMain.on('start-window-picker', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createWindowPickerWindow()
})

ipcMain.on('cancel-window-picker', () => {
  destroyWindowPickerWindow()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('window-selection-cancelled')
  }
})

ipcMain.on('window-selected', (_, windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => {
  destroyWindowPickerWindow()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('window-selected', windowData)
  }
})

// ============================================
// 摄像头预览 IPC
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
  if (mainWindow) {
    mainWindow.show()
  }
})

ipcMain.on('camera-settings-confirmed', (_, settings: { deviceId: string }) => {
  cameraPreviewConfirming = true
  currentCameraDeviceId = settings.deviceId
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('camera-settings-confirmed', settings)
  }
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
// 画中画 IPC
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
  // 保留阴影幕布，完全阻止其接收鼠标事件，避免事件转发导致鼠标状态闪烁
  if (selectionWindow) {
    selectionWindow.setIgnoreMouseEvents(true)
    selectionWindow.webContents.send('switch-to-recording-visuals')
  }

  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('area-selected', area)
  }
})

ipcMain.on('cancel-area-selection', () => {
  destroySelectionWindow()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('area-selection-cancelled')
  }
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
    console.error('[ZapRec] FFmpeg execution error:', err)
  }
})

app.whenReady().then(() => {
  // 自动授予摄像头和麦克风权限
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
