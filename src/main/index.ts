import { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, globalShortcut, nativeImage, shell, dialog, protocol, screen, session, systemPreferences } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

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
let tray: Tray | null = null
let writeStream: fs.WriteStream | null = null

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
    selectionWindow.close()
    selectionWindow = null
  }
}

// ============================================

ipcMain.on('start-area-selection', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createSelectionWindow()
})

ipcMain.on('area-selected', (_, area: { x: number; y: number; width: number; height: number }) => {
  // 专家体验升级：不销毁遮罩，保留其为阴影幕布，开启鼠标穿透
  if (selectionWindow) {
    selectionWindow.setIgnoreMouseEvents(true, { forward: true })
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

// 专家体验升级：用户彻底停止录制时，才销毁幕布窗口
ipcMain.on('recording-stopped', () => {
  destroySelectionWindow()
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
