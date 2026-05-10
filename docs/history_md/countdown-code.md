# 3秒倒计时相关代码整理

## 状态类型定义

**文件**: `src/shared/types.ts`

```typescript
export type RecordingStatus = 'idle' | 'countdown' | 'recording' | 'paused'
```

## Store 状态管理

**文件**: `src/store/useAppStore.ts`

- `status`: 当前录制状态 (`'idle' | 'countdown' | 'recording' | 'paused'`)
- `countdownValue`: 倒计时数值（当前未实际使用）
- `setStatus(status)`: 设置状态
- `setCountdownValue(value)`: 设置倒计时数值

## 倒计时代码分布

### 1. 全屏模式 (display) - Toolbar.tsx

**位置**: `src/components/Toolbar.tsx` 第 121-133 行

当用户点击全屏录制按钮时，直接在 Toolbar 组件内触发倒计时：

```typescript
const handleSourceClick = useCallback((source: RecordingSource) => {
  if (isRecording) return
  
  // ... area、window、camera 模式提前 return

  // 全屏模式直接开始倒计时
  setSelectedSource(source)
  setStatus('countdown')
  let count = 3  // ⚠️ 硬编码 3，未使用 settings.countdown
  const countdownTimer = setInterval(() => {
    count--
    if (count <= 0) {
      clearInterval(countdownTimer)
      setStatus('idle')
      onStartRecording()
    } else {
      setStatus('countdown')
    }
  }, 1000)
}, [...])
```

**问题**: 倒计时数值 `count = 3` 是硬编码的，没有读取 `settings.countdown` 配置。

---

### 2. 窗口模式 (window) - App.tsx

**位置**: `src/App.tsx` 第 418-448 行

在 `onWindowSelected` 回调中触发倒计时：

```typescript
useEffect(() => {
  const unlistenWindowSelected = window.caplet.onWindowSelected((windowData) => {
    useAppStore.getState().setSelectedWindow(windowData)
    
    const countdownSeconds = useAppStore.getState().settings.countdown || 3
    let count = countdownSeconds
    
    setStatus('countdown')
    const countdownTimer = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(countdownTimer)
        setStatus('idle')
        startRecording()
      } else {
        setStatus('countdown')
      }
    }, 1000)
  })

  const unlistenWindowCancelled = window.caplet.onWindowSelectionCancelled(() => {
    useAppStore.getState().setSelectedSource('display')
  })

  return () => {
    unlistenWindowSelected()
    unlistenWindowCancelled()
  }
}, [setStatus, startRecording])
```

---

### 3. 区域模式 (area) - Toolbar.tsx

**位置**: `src/components/Toolbar.tsx` 第 69-91 行

在 `onAreaSelected` 回调中触发倒计时：

```typescript
useEffect(() => {
  const unlisten = window.caplet.onAreaSelected((area) => {
    setPendingAreaSelection(area)
    setSelectedSource('area')

    const countdownSeconds = settings.countdown || 3
    let count = countdownSeconds
    
    setStatus('countdown')
    const countdownTimer = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(countdownTimer)
        setStatus('idle')
        onStartRecording()
      } else {
        setStatus('countdown')
      }
    }, 1000)
  })
  
  return () => unlisten()
}, [settings.countdown, setSelectedSource, setPendingAreaSelection, setStatus, onStartRecording])
```

---

### 4. 摄像头模式 (camera) - App.tsx

**位置**: `src/App.tsx` 第 395-416 行

在 `onCameraSettingsConfirmed` 回调中触发倒计时：

```typescript
useEffect(() => {
  const unlisten = window.caplet.onCameraSettingsConfirmed((settings) => {
    useAppStore.getState().setPendingCameraSettings(settings)
    useAppStore.getState().setSelectedSource('camera')

    const countdownSeconds = useAppStore.getState().settings.countdown || 3
    let count = countdownSeconds

    setStatus('countdown')
    const countdownTimer = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(countdownTimer)
        setStatus('idle')
        startRecording()
      } else {
        setStatus('countdown')
      }
    }, 1000)
  })
  return () => unlisten()
}, [setStatus, startRecording])
```

---

## Toolbar 状态显示逻辑

**文件**: `src/components/Toolbar.tsx`

当前 Toolbar 中间区域根据 `isRecording` 判断显示录制源按钮还是录制计时器：

```typescript
{isRecording ? (
  // 显示录制计时器 + 暂停/停止按钮
  <>
    <div className="flex items-center gap-2 mr-2">
      <div className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: isPaused ? '#fbbf24' : '#ef4444', ... }}
      />
      <span className="font-mono text-white text-sm font-medium tracking-wide">
        {formatTime(recordingTime)}
      </span>
    </div>
    {/* 暂停/恢复按钮 */}
    {/* 停止按钮 */}
  </>
) : (
  // 显示录制源按钮列表
  (['display', 'window', 'area', 'camera'] as const).map((source) => { ... })
)}
```

**注意**: 当前逻辑中 `isRecording` 只判断 `status === 'recording'`，**没有考虑 `status === 'countdown'` 状态下的显示**。

---

## 问题汇总

| 模式 | 文件 | 倒计时数值来源 | 问题 |
|------|------|---------------|------|
| display | Toolbar.tsx | 硬编码 `3` | ❌ 未读取 `settings.countdown` |
| window | App.tsx | `settings.countdown \|\| 3` | ✅ 正确 |
| area | Toolbar.tsx | `settings.countdown \|\| 3` | ✅ 正确 |
| camera | App.tsx | `settings.countdown \|\| 3` | ✅ 正确 |

---

## 待修复项

1. **全屏模式倒计时**: Toolbar.tsx 中的 `handleSourceClick` 硬编码了 `count = 3`，应改为 `const count = settings.countdown || 3`
2. **倒计时状态显示**: Toolbar 当前没有处理 `status === 'countdown'` 时的 UI 显示逻辑
3. **倒计时数值同步**: `countdownValue` 在 store 中存在但从未被设置/使用

---

## 建议的重构方向

1. 将倒计时逻辑统一到一个地方（如 App.tsx 的 useEffect）
2. 使用 `countdownValue` 存储并显示倒计时剩余秒数
3. Toolbar 中添加 `status === 'countdown'` 时的 UI 分支，显示倒计时数字
