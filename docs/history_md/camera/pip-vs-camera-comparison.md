# PiP 小窗 vs 摄像头录制小窗 对比分析

## 1. 主进程窗口创建对比

### createPipWindow (line 484-541)
```javascript
pipWindow = new BrowserWindow({
  width: initialWidth,   // 356px (md)
  height: initialHeight, // 200px
  x: screenWidth - initialWidth - 50,  // 右下角
  y: screenHeight - initialHeight - 50,
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  resizable: false,
  minimizable: false,
  maximizable: false,
  hasShadow: false,
  skipTaskbar: true,
  // 无 type 声明（默认 standard）
  // 无 hookWindowMessage
})

pipWindow.setAspectRatio(16 / 9)
pipWindow.setAlwaysOnTop(true, 'screen-saver')
```

### createCameraPreviewWindow (line 403-443)
```javascript
cameraPreviewWindow = new BrowserWindow({
  x, y, width, height,  // 全屏尺寸（初始创建时）
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  hasShadow: false,
  movable: true,
  resizable: false,
  minimizable: false,
  maximizable: false,
  type: 'panel',  // ⚠️ PiP 没有这个
  webPreferences: { ... }
})

cameraPreviewWindow.setResizable(false)
cameraPreviewWindow.setAlwaysOnTop(true, 'screen-saver')
// 无 setAspectRatio 调用
// 无 hookWindowMessage
```

### 关键差异总结

| 属性 | PiP 窗口 | 摄像头预览窗口 |
|------|---------|--------------|
| 初始尺寸 | 356×200 小窗 | 全屏尺寸 |
| `type` | 无（默认 standard） | `'panel'` |
| `hookWindowMessage(0x0084)` | 无 | ~~有~~（已删除） |
| `setAspectRatio` | 有 | **无** |
| `setMinimumSize` | 无 | 有（show-camera-window 时） |
| 初始位置 | 右下角 | 左上角（全屏） |

---

## 2. 渲染层组件对比

### PipWindow (src/components/PipWindow.tsx)
```tsx
<div
  className="w-screen h-screen overflow-hidden relative flex items-center justify-center"
  onMouseEnter={() => setIsHovered(true)}
  onMouseLeave={() => setIsHovered(false)}
  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
>
  <div
    className="w-full h-full overflow-hidden bg-black/80 rounded-lg"
    style={{
      WebkitAppRegion: 'drag',
      WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      transform: 'translateZ(0)'
    } as React.CSSProperties}
  >
    <video ... />
  </div>

  <div
    className={`absolute top-3 right-3 flex gap-1.5 ... ${isHovered ? 'opacity-100' : 'opacity-0'}`}
    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
  >
    {/* 3 个按钮: toggleSize, toggleShape, handleClose */}
  </div>
</div>
```

### CameraPreviewOverlay (recording 模式, src/components/CameraPreviewOverlay.tsx:157-209)
```tsx
<div
  className="w-full h-full overflow-hidden relative flex items-center justify-center"
  onMouseEnter={() => setIsHovered(true)}
  onMouseLeave={() => setIsHovered(false)}
  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
>
  <div
    className="w-full h-full overflow-hidden bg-black/80 rounded-lg shadow-lg"
    style={{
      WebkitAppRegion: 'drag',
      WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      transform: 'translateZ(0)'
    } as React.CSSProperties}
  >
    <video ... />
  </div>

  <div
    className={`absolute top-2 right-2 flex gap-1.5 ... ${isHovered ? 'opacity-100' : 'opacity-0'}`}
    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
  >
    {/* 3 个按钮: toggleSize, hideCameraWindow, sendRecordingStopped */}
  </div>
</div>
```

### 渲染层差异总结

| 属性 | PiP 窗口 | 摄像头录制窗口 |
|------|---------|--------------|
| 外层容器 | `w-screen h-screen` | `w-full h-full` |
| 内层 drag 容器 | `w-full h-full` | `w-full h-full` |
| WebkitMaskImage | `-webkit-radial-gradient(white, black)` | `-webkit-radial-gradient(white, black)` |
| transform | `translateZ(0)` | `translateZ(0)` |
| 控制栏位置 | `top-3 right-3` | `top-2 right-2` |
| 控制栏背景 | `bg-black/60` | `bg-black/60` |
| 按钮数量 | 3 个（size/shape/close） | 3 个（size/hide/stop） |
| hover 事件 | onMouseEnter/onMouseLeave | onMouseEnter/onMouseLeave |
| 控制栏 opacity | `opacity-100` / `opacity-0` | `opacity-100` / `opacity-0` |

---

## 3. 窗口显示流程对比

### PiP 窗口
1. 用户点击 PiP 按钮
2. `open-pip` IPC → `createPipWindow()` 直接创建小窗（356×200，右下角）
3. 渲染器直接渲染 `PipWindow`，无模式切换

### 摄像头预览窗口
1. 用户点击摄像头按钮 → 弹出全屏预览窗口（640×360 居中）
2. 用户选择设备，按 Enter 确认
3. `camera-settings-confirmed` IPC → 隐藏全屏窗口，销毁 stream
4. `showCameraWindow()` → `show-camera-window` IPC → 窗口缩到右下角小窗（356×200）
5. `set-camera-preview-mode` IPC → 渲染器切换到 `recording` 模式
6. 渲染器调用 `initStream()` 获取新的 camera stream

---

## 4. 发现的可能问题

### 问题 1: `type: 'panel'` vs 无 type
- PiP 窗口没有声明 `type`，使用默认的 `standard`
- 摄像头预览窗口使用 `type: 'panel'`
- `panel` 类型窗口在 Windows 上可能有不同的 hit-test 行为

### 问题 2: `setAspectRatio` 未在摄像头窗口上调用
- PiP 窗口显式调用 `setAspectRatio(16/9)`
- 摄像头预览窗口从未调用 `setAspectRatio`
- 当 `show-camera-window` 用 `setBounds` 设置 356×200 时，如果没有 aspect ratio 约束，窗口可能不会严格保持 16:9

### 问题 3: `w-screen h-screen` vs `w-full h-full`
- PiP 窗口外层用 `w-screen h-screen`（填满**视口**）
- 摄像头录制窗口外层用 `w-full h-full`（填满**父容器**，即 BrowserWindow 的 contentView）
- 在 Electron 的 BrowserWindow 中，`w-screen h-screen` 和 `w-full h-full` 理论上应该一致（因为 contentView 就是窗口大小），但如果有任何包装层，可能导致尺寸不匹配

### 问题 4: 窗口尺寸变化时序
- PiP 窗口：小窗从一开始就直接创建好
- 摄像头预览窗口：先全屏创建 → show-camera-window 才缩到小窗
- `show-camera-window` 的 `setBounds` 和 `setMinimumSize` 调用顺序和时机可能导致 Chromium 重新计算布局

---

## 5. 待验证

1. **`type: 'panel'` 是否有影响**：尝试把摄像头窗口的 `type: 'panel'` 也去掉，看 hover/drag 是否恢复正常
2. **`setAspectRatio` 是否需要**：在 `show-camera-window` 或窗口创建时添加 `setAspectRatio(16/9)`
3. **`w-full h-full` 是否足够**：确认在 recording 模式下，BrowserWindow 的 contentView 确实就是 356×200
