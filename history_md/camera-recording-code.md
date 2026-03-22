# ZapRec 摄像头录制功能 - 现有代码整理

## 一、代码分布总览

| 文件 | 职责 | 相关行号 |
|------|------|----------|
| `src/core/MediaCapturer.ts` | 摄像头捕获实现 | 55, 134-147, 163-168 |
| `src/App.tsx` | 录制启动逻辑 | 197-199, 233-238 |
| `src/components/Toolbar.tsx` | UI 按钮 | 24, 31, 203-224, 261-270 |
| `src/store/useAppStore.ts` | 状态管理 | 42, 58 |
| `src/shared/types.ts` | 类型定义 | 9, 31 |

---

## 二、核心代码

### 2.1 MediaCapturer.ts - 摄像头捕获

**文件**: `src/core/MediaCapturer.ts`

```typescript
// 第 55 行 - 类成员变量
private cameraStream: MediaStream | null = null

// 第 134-147 行 - 启动摄像头捕获
async startCameraCapture(): Promise<MediaStream> {
  this.stopCameraCapture()
  
  this.cameraStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 }
    }
  })
  
  return this.cameraStream
}

// 第 163-168 行 - 停止摄像头捕获
stopCameraCapture(): void {
  if (this.cameraStream) {
    this.cameraStream.getTracks().forEach(track => track.stop())
    this.cameraStream = null
  }
}
```

---

### 2.2 App.tsx - 录制启动逻辑

**文件**: `src/App.tsx` (第 197-199 行)

```typescript
} else if (currentSource === 'camera') {
  displayStream = await mediaCapturer.startCameraCapture()
  displayStreamRef.current = displayStream
```

**问题分析**：
- 摄像头模式获取 `displayStream` 后，没有像窗口模式那样获取实际分辨率
- 默认使用 `recordingWidth = quality.width` 和 `recordingHeight = quality.height`（来自第 170-171 行的默认值）
- 摄像头实际分辨率可能与预设不一致

---

### 2.3 Toolbar.tsx - 源选择按钮

**文件**: `src/components/Toolbar.tsx`

```typescript
// 第 24 行 - 图标映射
const sourceIcons: Record<RecordingSource, typeof Monitor> = {
  display: Monitor,
  window: AppWindow,
  area: Square,
  camera: Video
}

// 第 31 行 - 标签映射
const sourceLabels: Record<RecordingSource, string> = {
  display: '全屏',
  window: '窗口',
  area: '区域',
  camera: '镜头'
}

// 第 203-224 行 - 录制源按钮
(['display', 'window', 'area', 'camera'] as const).map((source) => {
  const IconComponent = sourceIcons[source]
  const titles: Record<RecordingSource, string> = {
    display: '录制整个屏幕',
    window: '录制指定窗口',
    area: '录制屏幕区域',
    camera: '仅录制摄像头'
  }
  return (
    <button key={source} onClick={() => handleSourceClick(source)}>
      <IconComponent size={18} />
      <span>{sourceLabels[source]}</span>
    </button>
  )
})

// 第 261-270 行 - 画中画按钮（摄像头叠加）
<button onClick={() => setCameraEnabled(!cameraEnabled)}>
  <SquareUser size={18} />
  <span>画中画</span>
</button>
```

---

### 2.4 useAppStore.ts - 状态管理

**文件**: `src/store/useAppStore.ts`

```typescript
// 第 42 行 - 状态初始化
cameraEnabled: false,

// 第 58 行 - setter
setCameraEnabled: (enabled: boolean) => set({ cameraEnabled: enabled }),
```

---

### 2.5 types.ts - 类型定义

**文件**: `src/shared/types.ts`

```typescript
// 第 9 行 - 录制源类型
export type RecordingSource = 'display' | 'window' | 'area' | 'camera'

// 第 31 行 - AppState 接口
cameraEnabled: boolean
```

---

## 三、当前实现状态

### 已实现功能
- [x] `RecordingSource` 类型包含 `'camera'`
- [x] `startCameraCapture()` 方法实现
- [x] Toolbar 中有"镜头"按钮
- [x] `cameraEnabled` 状态（但当前用于画中画功能）

### 潜在问题

| 问题 | 位置 | 说明 |
|------|------|------|
| **分辨率未获取** | App.tsx 197-199 | 摄像头模式没有像窗口模式那样获取实际分辨率 |
| **cameraEnabled 语义混淆** | Toolbar.tsx | `cameraEnabled` 当前是"画中画"开关，不是"仅摄像头录制" |
| **默认分辨率** | App.tsx 170-171 | 使用 `quality.width/height`（1920x1080）作为默认值 |

---

## 四、与窗口录制的代码对比

### 窗口录制（参考 App.tsx 182-219）

```typescript
} else if (currentSource === 'window') {
  displayStream = await mediaCapturer.startWindowCapture(windowInfo.id)
  displayStreamRef.current = displayStream
  
  const videoTrack = displayStream.getVideoTracks()[0]
  if (videoTrack) {
    // ✅ 窗口模式：使用 Promise 获取真实分辨率
    const realSize = await getRealDimensions(displayStream)
    recordingWidth = realSize.width
    recordingHeight = realSize.height
    // ...
  }
}
```

### 摄像头录制（当前 App.tsx 197-199）

```typescript
} else if (currentSource === 'camera') {
  displayStream = await mediaCapturer.startCameraCapture()
  displayStreamRef.current = displayStream
  // ❌ 缺少：获取实际分辨率的代码
}
```

---

## 五、建议的修改方案

### 方案 A：使用与窗口模式相同的分辨率获取逻辑

```typescript
} else if (currentSource === 'camera') {
  displayStream = await mediaCapturer.startCameraCapture()
  displayStreamRef.current = displayStream
  
  const videoTrack = displayStream.getVideoTracks()[0]
  if (videoTrack) {
    const realSize = await getRealDimensions(displayStream)
    recordingWidth = realSize.width
    recordingHeight = realSize.height
    if (recordingWidth % 2 !== 0) recordingWidth--
    if (recordingHeight % 2 !== 0) recordingHeight--
  }
}
```

### 方案 B：从 track settings 获取分辨率

```typescript
} else if (currentSource === 'camera') {
  displayStream = await mediaCapturer.startCameraCapture()
  displayStreamRef.current = displayStream
  
  const videoTrack = displayStream.getVideoTracks()[0]
  if (videoTrack) {
    const settings = videoTrack.getSettings()
    recordingWidth = settings.width || quality.width
    recordingHeight = settings.height || quality.height
    if (recordingWidth % 2 !== 0) recordingWidth--
    if (recordingHeight % 2 !== 0) recordingHeight--
  }
}
```

---

## 六、讨论要点

1. **分辨率获取方式**：方案 A（Promise + video 元素）vs 方案 B（track settings）
2. **摄像头约束参数**：`width: { ideal: 640 }, height: { ideal: 480 }` 是否需要调整？
3. **音频处理**：摄像头模式是否需要麦克风输入？
4. **与画中画功能的关系**：`cameraEnabled` 的双重用途是否合理？
