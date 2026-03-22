大概功能已经实现了，但整体还是有很多 bug：

1. 如屏幕截图所示，在画中画窗口比较小的时候，显示的是左上角的区域（画面本身做了镜像反转），直到拉大窗口人像才慢慢出现，这个裁剪的准心明显有问题，正常来说肯定是以正中间的区域为主；同时窗口侧边的横纵滚动条完全不需要存在；

2. 对于画中画按钮是否可用的状态管理非常混乱：先打开画中画，再点击非全屏的其他录制模式，尽管画中画按钮变成不可用状态，但画中画窗口并没有随之关闭（优先级是最高的）；同时，当结束录制时，画中画按钮应该恢复为可用但未打开状态，画中画窗口正常关闭即可；画中画窗口需要与画中画按钮的状态保持同步；

3. 画中画窗口内部的右上角可以加一些鼠标悬浮显示的按钮，包括镜像与否，画中画小窗关闭与否（关闭则顺带关闭画中画按钮），切换小窗为方形/圆形按钮；

结合当前代码，给出修复方案：

# 画中画 (PiP) 功能代码整理



## 一、架构概览



```

用户点击"画中画"按钮 (Toolbar)

          │

          ▼

   cameraEnabled = true

   window.caplet.openPiPWindow()

          │

          ▼

   主进程: createPiPWindow()

          │

          ▼

   创建独立 BrowserWindow (280×158px, 右下角, 透明, 置顶)

          │

          ▼

   pip.html → pip.tsx → PiPOverlay 组件

          │

          ▼

   摄像头画面渲染 (独立摄像头流)

          │

          ▼

   系统截屏时, PiP 窗口内容被自动捕获进录制视频

```



---



## 二、文件清单



| 文件 | 职责 |

|------|------|

| `pip.html` | PiP 窗口 HTML 入口 |

| `src/pip.tsx` | PiP 窗口 React 入口 |

| `src/components/PiPOverlay.tsx` | PiP 摄像头悬浮窗 UI 组件 |

| `src/preload/index.ts` | IPC 桥接: openPiPWindow / closePiPWindow |

| `src/main/index.ts` | 主进程窗口管理 |

| `src/components/Toolbar.tsx` | 画中画按钮交互逻辑 |

| `src/App.tsx` | 录制停止时自动清理 PiP |

| `vite.config.ts` | 多页入口配置 |

| `src/core/MediaCapturer.ts` | TypeScript 类型声明 |



---



## 三、代码分布



### 1. PiP 窗口入口 (HTML)



**文件**: `pip.html`



```html

<!DOCTYPE html>

<html lang="zh-CN">

  <head>

    <meta charset="UTF-8" />

    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:;" />

    <title>画中画 - ZapRec</title>

    <style>

      body { margin: 0; background: transparent; }

    </style>

  </head>

  <body>

    <div id="root"></div>

    <script type="module" src="/src/pip.tsx"></script>

  </body>

</html>

```



---



### 2. PiP React 入口



**文件**: `src/pip.tsx`



```tsx

import React from 'react'

import ReactDOM from 'react-dom/client'

import PiPOverlay from './components/PiPOverlay'



ReactDOM.createRoot(document.getElementById('root')!).render(

  <React.StrictMode>

    <PiPOverlay />

  </React.StrictMode>

)

```



---



### 3. PiP UI 组件



**文件**: `src/components/PiPOverlay.tsx`



```tsx

import { useEffect, useRef } from 'react'



export default function PiPOverlay() {

  const videoRef = useRef<HTMLVideoElement>(null)



  useEffect(() => {

    let stream: MediaStream | null = null



    navigator.mediaDevices.getUserMedia({

      video: { width: { ideal: 1280 }, height: { ideal: 720 } }

    }).then(s => {

      stream = s

      if (videoRef.current) {

        videoRef.current.srcObject = s

      }

    }).catch(err => {

      console.error('[ZapRec PiP] Failed to get camera:', err)

    })



    return () => {

      if (stream) {

        stream.getTracks().forEach(t => t.stop())

      }

    }

  }, [])



  return (

    <div 

      className="w-full h-full rounded-lg overflow-hidden border-2 border-white/20 shadow-2xl bg-black relative group"

      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}

    >

      <video 

        ref={videoRef} 

        autoPlay 

        muted 

        playsInline

        className="w-full h-full object-cover pointer-events-none"

        style={{ 

          objectPosition: 'center',

          transform: 'scaleX(-1)'

        }} 

      />

      

      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-sm font-medium">

        按住拖拽

      </div>

    </div>

  )

}

```



**设计要点**:

- `WebkitAppRegion: drag` 使整个窗口可拖拽

- `objectPosition: center` + `transform: scaleX(-1)` 组合确保人像居中显示

- `group-hover` 悬浮提示"按住拖拽"

- 独立的摄像头流，不影响主录制流



---



### 4. IPC 桥接 (Preload)



**文件**: `src/preload/index.ts` 第 84-86 行



```typescript

openPiPWindow: () => ipcRenderer.send('open-pip-window'),

closePiPWindow: () => ipcRenderer.send('close-pip-window')

```



---



### 5. 主进程窗口管理



**文件**: `src/main/index.ts`



#### 5.1 全局变量 (第 30 行)



```typescript

let pipWindow: BrowserWindow | null = null

```



#### 5.2 创建窗口函数 (第 534-571 行)



```typescript

function createPiPWindow() {

  if (pipWindow) return



  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  const pipWidth = 280

  const pipHeight = 158

  const margin = 20



  pipWindow = new BrowserWindow({

    width: pipWidth,

    height: pipHeight,

    x: screenWidth - pipWidth - margin,   // 右下角

    y: screenHeight - pipHeight - margin,

    transparent: true,

    frame: false,

    alwaysOnTop: true,

    hasShadow: true,

    resizable: true,

    webPreferences: {

      preload: path.join(__dirname, '../preload/index.cjs'),

      contextIsolation: true,

      nodeIntegration: false,

      sandbox: false

    }

  })



  pipWindow.setAlwaysOnTop(true, 'screen-saver')



  if (VITE_DEV_SERVER_URL) {

    pipWindow.loadURL(`${VITE_DEV_SERVER_URL.replace('/index.html', '')}/pip.html`)

  } else {

    pipWindow.loadFile(path.join(__dirname, '../../dist/pip.html'))

  }



  pipWindow.on('closed', () => {

    pipWindow = null

  })

}

```



#### 5.3 IPC 处理器 (第 573-581 行)



```typescript

ipcMain.on('open-pip-window', () => {

  createPiPWindow()

})



ipcMain.on('close-pip-window', () => {

  if (pipWindow) {

    pipWindow.close()

  }

})

```



**窗口特性**:

- `transparent: true` + `frame: false`: 无边框透明窗口

- `alwaysOnTop: true, 'screen-saver'`: 绝对置顶

- `resizable: true`: 用户可自由拉伸大小

- 默认位置: 主屏幕右下角 (距边缘 20px)



---



### 6. Toolbar 按钮交互



**文件**: `src/components/Toolbar.tsx`



#### 6.1 Store 状态 (第 43-56 行)



```typescript

export default function Toolbar({ ... }) {

  const {

    status,

    countdownValue,

    selectedSource,        // 用于判断是否支持 PiP

    cameraEnabled,         // PiP 开关状态

    setCameraEnabled

  } = useAppStore()

```



#### 6.2 画中画按钮 (第 281-312 行)



```typescript

{(() => {

  const isPiPSupported = selectedSource === 'display' || selectedSource === 'area'

  

  return (

    <button 

      onClick={() => {

        if (!isPiPSupported) return



        const nextState = !cameraEnabled

        setCameraEnabled(nextState)

        

        if (nextState) {

          window.caplet.openPiPWindow()

        } else {

          window.caplet.closePiPWindow()

        }

      }}

      disabled={!isPiPSupported}

      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all shrink-0 ${

        !isPiPSupported

          ? 'opacity-40 cursor-not-allowed'

          : 'hover:bg-white/10'

      }`}

      title={isPiPSupported ? "开启/关闭画中画" : "当前录制模式不支持画中画"}

    >

      <SquareUser size={18} strokeWidth={2} color={cameraEnabled ? 'white' : 'rgba(255,255,255,0.4)'} />

      <span className={`text-sm whitespace-nowrap font-medium ${cameraEnabled ? 'text-white' : 'text-white/40'}`}>

        画中画

      </span>

    </button>

  )

})()}

```



---



### 7. App.tsx 路由注册



**文件**: `src/App.tsx` 第 16-19 行



```typescript

const isPiPMode = window.location.hash === '#/pip'



if (isPiPMode) {

  return <PiPOverlay />

}

```



---



### 8. 录制停止自动清理



**文件**: `src/App.tsx` 第 345-348 行 / 第 359-362 行



```typescript

// 正常停止

if (useAppStore.getState().cameraEnabled) {

  window.caplet.closePiPWindow()

  useAppStore.getState().setCameraEnabled(false)

}



// 异常捕获停止

if (useAppStore.getState().cameraEnabled) {

  window.caplet.closePiPWindow()

  useAppStore.getState().setCameraEnabled(false)

}

```



---



### 9. TypeScript 类型声明



**文件**: `src/core/MediaCapturer.ts` 第 36-37 行



```typescript

openPiPWindow: () => void

closePiPWindow: () => void

```



---



### 10. Vite 多页入口



**文件**: `vite.config.ts` 第 64 行



```typescript

rollupOptions: {

  input: {

    main: path.resolve(__dirname, 'index.html'),

    'window-picker': path.resolve(__dirname, 'window-picker.html'),

    'camera-preview': path.resolve(__dirname, 'camera-preview.html'),

    'pip': path.resolve(__dirname, 'pip.html')  // 新增

  }

}

```



---



### 1. 独立摄像头流

PiP 窗口使用独立的 `navigator.mediaDevices.getUserMedia()` 流，与主录制流完全隔离，避免资源冲突。



### 2. 零性能损耗

利用系统原生截屏能力，PiP 窗口内容被自动捕获进录制视频，无需前端 Canvas 重绘合成。



### 3. 可拖拽可拉伸

`WebkitAppRegion: drag` 使整个窗口区域可拖拽，`resizable: true` 允许用户调整大小。



### 4. 绝对置顶

`setAlwaysOnTop(true, 'screen-saver')` 确保 PiP 覆盖在 PPT、全屏游戏等之上。



### 5. 自动清理

录制停止时自动关闭 PiP 窗口并重置状态，防止窗口残留。

