# 托盘菜单动态更新修复方案

## 1. 暴露状态同步 API (Preload 层)
**文件**: `src/preload/index.ts`
**目标**: 增加一个向主进程发送当前 App 状态的通道。

```typescript
// 在暴露的 api 对象中追加 updateAppState
export const api = {
  // ... 其他已有 api ...

  // 同步状态到主进程用于更新托盘菜单
  updateAppState: (state: { status: string; source: string }) => {
    ipcRenderer.send('update-app-state', state)
  }
}
```

---

## 2. 监听状态并推送 (UI 渲染层)
**文件**: `src/App.tsx`
**目标**: 在 React 组件中监听 Zustand store 的状态变化，并实时推送到主进程。

```tsx
import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'

export default function App() {
  // 1. 提取出当前录制状态和录制源
  const status = useAppStore(state => state.status) 
  const selectedSource = useAppStore(state => state.selectedSource)

  // 2. 状态改变时，通知主进程更新托盘
  useEffect(() => {
    const caplet = window.caplet as any
    if (caplet && caplet.updateAppState) {
      caplet.updateAppState({
        status: status,
        source: selectedSource
      })
    }
  }, [status, selectedSource])
  
  // ... 其他代码 ...
}
```

---

## 3. 重构托盘菜单逻辑 (主进程 Main)
**文件**: `src/main/index.ts`
**目标**: 接收状态并动态重建托盘菜单，高度复用已有的快捷键事件和 `showToolbar` 逻辑。

```typescript
import { app, Tray, Menu, nativeImage, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'

// 1. 定义全局状态缓存
let currentAppState = { status: 'idle', source: 'display' }

// 2. 抽离托盘菜单构建逻辑
function updateTrayMenu() {
  if (!tray) return

  // 解析当前状态
  const isIdle = currentAppState.status === 'idle'
  const isRecording = currentAppState.status === 'recording'
  const isPaused = currentAppState.status === 'paused'
  const isCameraMode = currentAppState.source === 'camera'

  // 根据当前状态决定第一项显示内容
  let startPauseLabel = '开始'
  if (isRecording) startPauseLabel = '暂停'
  if (isPaused) startPauseLabel = '继续'

  const contextMenu = Menu.buildFromTemplate([
    {
      label: startPauseLabel,
      click: () => {
        // 复用快捷键的触发逻辑
        if (isIdle) {
          mainWindow?.webContents.send('shortcut:toggle-record')
        } else {
          mainWindow?.webContents.send('shortcut:toggle-pause')
        }
      }
    },
    {
      label: '停止',
      enabled: !isIdle, // 空闲状态下不可点击
      click: () => {
        if (!isIdle) {
          // 在非空闲状态下，触发 toggle-record 就会执行停止逻辑
          mainWindow?.webContents.send('shortcut:toggle-record') 
        }
      }
    },
    {
      label: '显示小窗',
      // 仅在纯摄像头模式且正在录制（或暂停）阶段才会显示该选项
      visible: isCameraMode && !isIdle, 
      click: () => {
        if (cameraRecordingWindow && !cameraRecordingWindow.isVisible()) {
          cameraRecordingWindow.show()
        }
      }
    },
    {
      label: '设置',
      click: () => {
        // 复用已存在的打开设置事件监听
        ipcMain.emit('open-settings') 
      }
    },
    {
      label: '打开主面板',
      click: () => {
        // 复用封装好的工具条显示函数
        showToolbar() 
      }
    },
    {
      label: '退出程序',
      click: () => app.quit()
    }
  ])

  // 更新菜单
  tray.setContextMenu(contextMenu)
}

// 3. 修改原有的 createTray 函数
function createTray() {
  const iconPath = getIconPath(16)
  let icon: Electron.NativeImage
  
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  } else {
    icon = nativeImage.createFromDataURL('data:image/png;base64,...') // 保持原有 base64 不变
  }
  
  tray = new Tray(icon)
  tray.setToolTip('ZapRec')
  
  // 修改：点击托盘图标也调用统一的工具条显示逻辑
  tray.on('click', () => {
    showToolbar()
  })

  // 初始构建一次菜单
  updateTrayMenu()
}

// 4. 监听来自渲染进程的状态更新
ipcMain.on('update-app-state', (_, state) => {
  currentAppState = state
  updateTrayMenu() // 状态改变，重新渲染菜单文字和可见性
})
```