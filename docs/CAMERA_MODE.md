# ZapRec 纯摄像头模式录制文档

## 一、模式概述

纯摄像头模式（Camera Mode）允许用户仅使用摄像头作为录制源进行屏幕录制，不依赖桌面捕获。

## 二、相关文件

- `src/components/CameraPreviewOverlay.tsx` - 摄像头预览窗口组件
- `src/App.tsx` - 模式切换入口
- `src/main/index.ts` - 主进程 IPC 处理
- `src/preload/index.ts` - 预加载脚本 API 暴露

## 三、主进程变量定义

```typescript
// src/main/index.ts:134-147
let cameraPreviewWindow: BrowserWindow | null = null    // 摄像头预览窗口（预览模式）
let cameraRecordingWindow: BrowserWindow | null = null  // 摄像头录制窗口（录制中小窗）
let cameraPreviewConfirming = false                     // 是否正在确认摄像头设置
let currentCameraDeviceId = ''                          // 当前选中的摄像头设备 ID
let currentCameraSizeTier: 'sm' | 'md' | 'lg' = 'md'   // 当前摄像头窗口尺寸

const CAMERA_SIZES = {
  sm: 140,
  md: 200,
  lg: 300
}
```

## 四、摄像头预览窗口功能 (CameraPreviewOverlay.tsx)

### 4.1 预览模式 (mode === 'preview')

用户在设置中选择"纯摄像头录制"后看到的预览界面。

**界面元素**：
- 顶部提示栏显示"纯摄像头录制"及快捷键说明
- 摄像头预览画面（水平镜像）
- 摄像头选择下拉菜单（悬停显示）

**操作**：
- `Enter` - 确认使用当前摄像头
- `Esc` - 取消返回
- 选择摄像头下拉框 - 切换不同摄像头设备

### 4.2 录制模式 (mode === 'recording')

录制时的摄像头小窗显示。

**右上角三个按钮**：

| 按钮 | 图标 | 功能 | 实现 |
|------|------|------|------|
| 切换大小 | `<Maximize2>` | 循环切换 sm/md/lg 三个尺寸 | `toggleSize()` → `window.caplet.setCameraSize()` |
| 隐藏窗口 | `<Minus>` | 隐藏摄像头窗口 | `window.caplet.hideCameraWindow()` |
| 停止录制 | `<X>` | 停止当前录制 | `window.caplet.requestRecordingStop()` |

## 五、按钮样式

```tsx
{/* 切换大小、隐藏窗口：透明黑底按钮 */}
<button className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md">
  <Maximize2 size={14} />
</button>

{/* 停止录制：红色按钮 */}
<button className="p-1.5 bg-red-500/80 hover:bg-red-600 rounded-full text-white backdrop-blur-md">
  <X size={14} />
</button>
```

**悬停显示逻辑**：
```tsx
<div className={`absolute top-2 right-2 flex gap-1.5 transition-opacity duration-200 z-10 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
```

## 六、摄像头窗口大小

尺寸切换循环：`sm` → `md` → `lg`

```tsx
const toggleSize = () => {
  const nextSize = size === 'sm' ? 'md' : size === 'md' ? 'lg' : 'sm'
  setSize(nextSize)
  window.caplet.setCameraSize(nextSize)
}
```

## 七、摄像头设备选择

```tsx
navigator.mediaDevices.enumerateDevices().then(allDevices => {
  const videoDevices = allDevices.filter(d => d.kind === 'videoinput')
  setDevices(videoDevices)
})
```

摄像头初始化：
```tsx
navigator.mediaDevices.getUserMedia({
  video: { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
})
```

## 八、模式切换入口

在 Toolbar 中点击"摄像头"按钮后触发：

```tsx
// src/App.tsx:561
useAppStore.getState().setSelectedSource('camera')
```

用户选择摄像头源后，调用 `window.caplet.startCameraPreview()` 打开预览窗口。

## 九、主窗口 IPC 调用

### 9.1 preload 暴露的 API

```typescript
// src/preload/index.ts:104-125
startCameraPreview: () => ipcRenderer.send('start-camera-preview'),
cancelCameraPreview: () => ipcRenderer.send('cancel-camera-preview'),
sendCameraSettingsConfirmed: (settings: { deviceId: string }) => {
  ipcRenderer.send('camera-settings-confirmed', settings)
},
setCameraSize: (size: 'sm' | 'md' | 'lg') => ipcRenderer.send('set-camera-size', size),
hideCameraWindow: () => ipcRenderer.send('hide-camera-window'),
showCameraWindow: () => ipcRenderer.send('show-camera-window'),
closeCameraPreviewWindow: () => ipcRenderer.send('close-camera-preview-window'),
requestRecordingStop: () => ipcRenderer.send('request-recording-stop'),
```

### 9.2 主进程 IPC 处理函数具体实现

#### 9.2.1 启动摄像头预览

```typescript
// main/index.ts:945-950
ipcMain.on('start-camera-preview', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
  createCameraPreviewWindow()
})
```

#### 9.2.2 取消摄像头预览

```typescript
// main/index.ts:952-959
ipcMain.on('cancel-camera-preview', () => {
  if (cameraPreviewWindow) {
    cameraPreviewWindow.close()
  }
  if (mainWindow) {
    mainWindow.show()
  }
})
```

#### 9.2.3 确认摄像头设置

```typescript
// main/index.ts:961-972
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
```

#### 9.2.4 设置摄像头窗口大小

```typescript
// main/index.ts:974-986
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
```

#### 9.2.5 隐藏摄像头窗口

```typescript
// main/index.ts:988-992
ipcMain.on('hide-camera-window', () => {
  if (cameraRecordingWindow) {
    cameraRecordingWindow.hide()
  }
})
```

#### 9.2.6 显示摄像头窗口（创建录制中小窗）

```typescript
// main/index.ts:994-1037
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
```

#### 9.2.7 关闭摄像头预览窗口

```typescript
// main/index.ts:1039-1048
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
```

#### 9.2.8 请求停止录制

```typescript
// main/index.ts:1108-1112
ipcMain.on('request-recording-stop', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-stop-requested')
  }
})
```

### 9.3 摄像头预览窗口创建

```typescript
// main/index.ts:762-809
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
```

## 十、事件监听（主进程→渲染进程）

| 事件名 | 方向 | 用途 |
|--------|------|------|
| `camera-settings-confirmed` | main → renderer | 通知主窗口摄像头设置已确认 |
| `camera-preview-cancelled` | main → renderer | 通知主窗口摄像头预览已取消 |
| `recording-stop-requested` | main → renderer | 通知主窗口停止录制请求 |
| `camera-preview-mode-changed` | main → renderer | 通知摄像头窗口模式切换 |
| `camera-window-show` | main → renderer | 通知摄像头窗口显示 |

## 十一、摄像头权限处理

```typescript
// main/index.ts:1146-1171
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
})
```

## 十二、托盘菜单实现 (v2.1)

### 12.1 变量声明

```typescript
// main/index.ts
let currentRecordingMode: 'screen' | 'camera' | null = null
```

### 12.2 托盘创建与动态菜单

```typescript
// main/index.ts
function createTray() {
  const appName = app.getName()
  const iconPath = getIconPath(16)
  let icon: Electron.NativeImage

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  } else {
    icon = nativeImage.createFromDataURL('data:image/png;base64,...')
  }

  tray = new Tray(icon)
  tray.setToolTip(appName)

  const showMainWindowSmooth = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(0)
      mainWindow.showInactive()
      setTimeout(() => mainWindow?.setOpacity(1), 30)
    }
  }

  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: showMainWindowSmooth
      },
      {
        label: '查看录屏',
        click: () => openSettingsWindow('recordings')
      },
      // 摄像头模式特供选项
      ...(currentRecordingMode === 'camera' ? [
        { type: 'separator' as const },
        {
          label: '显示摄像头小窗',
          click: () => {
            if (cameraRecordingWindow && !cameraRecordingWindow.isDestroyed() && !cameraRecordingWindow.isVisible()) {
              cameraRecordingWindow.setOpacity(0)
              cameraRecordingWindow.showInactive()
              setTimeout(() => {
                if (!cameraRecordingWindow?.isDestroyed()) {
                  cameraRecordingWindow?.setOpacity(1)
                }
              }, 30)
            }
          }
        }
      ] : []),
      { type: 'separator' as const },
      { label: '设置', click: () => openSettingsWindow('general') },
      { label: '退出', click: () => app.quit() }
    ])
    tray?.popUpContextMenu(contextMenu)
  })

  tray?.on('click', showMainWindowSmooth)
}
```

### 12.3 菜单项清单与交互规范

| 菜单项标签 | 交互行为 | 视觉/逻辑说明 |
|-----------|---------|--------------|
| **显示主窗口** | 调用 `showInactive()` + `setOpacity` | 丝滑显示，使用不透明度渐变消除闪烁 |
| **查看录屏** | 跳转至设置页 `recordings` | 通过 `openSettingsWindow('recordings')` 实现 |
| **显示摄像头小窗** | 条件渲染 | 仅在摄像头录制模式下显示，使用透明度渐显 |
| **设置** | 跳转至设置页 `general` | 通过 `openSettingsWindow('general')` 打开 |
| **退出** | 调用 `app.quit()` | 彻底结束应用进程 |

### 12.4 窗口导航广播

```typescript
// main/index.ts
function openSettingsWindow(targetTab?: string) {
  if (settingsWindow) {
    settingsWindow.show()
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore()
    }
    settingsWindow.focus()
    if (targetTab) {
      settingsWindow.webContents.once('did-finish-load', () => {
        settingsWindow?.webContents.send('navigate-to-tab', targetTab)
      })
    }
  } else {
    createSettingsWindow()
    if (targetTab) {
      setTimeout(() => {
        settingsWindow?.webContents.send('navigate-to-tab', targetTab)
      }, 500)
    }
  }
}
```

### 12.5 优化：丝滑唤醒已隐藏的摄像头小窗

```typescript
// main/index.ts
ipcMain.on('show-camera-window', () => {
  if (cameraRecordingWindow) {
    if (!cameraRecordingWindow.isVisible()) {
      // 窗口存在但被隐藏了，丝滑唤醒
      cameraRecordingWindow.setOpacity(0)
      cameraRecordingWindow.showInactive()
      setTimeout(() => {
        if (!cameraRecordingWindow?.isDestroyed()) {
          cameraRecordingWindow?.setOpacity(1)
        }
      }, 30)
    }
    return
  }
  // ... 新建窗口逻辑
})
```

### 12.6 优化：停止录制时立即隐藏小窗

```typescript
// main/index.ts
ipcMain.on('request-recording-stop', () => {
  // 立即隐藏摄像头小窗，给用户零延迟反馈
  if (cameraRecordingWindow && !cameraRecordingWindow.isDestroyed()) {
    cameraRecordingWindow.hide()
  }
  // 通知主窗口执行耗时的停止和保存操作
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-stop-requested')
  }
})
```

### 12.7 优化：停止录制时切断硬件流

```typescript
// src/components/CameraPreviewOverlay.tsx (录制模式下的停止按钮)
<button
  onClick={() => {
    // 瞬间切断硬件流，让摄像头物理指示灯秒灭
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
    }
    // 发送停止请求给主进程
    window.caplet.requestRecordingStop()
  }}
  title="停止录制"
  className="p-1.5 bg-red-500/80 hover:bg-red-600 rounded-full text-white backdrop-blur-md"
>
  <X size={14} />
</button>
```