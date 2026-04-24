# 录制功能问题分析文档

## 问题概述

| # | 问题描述 |
|---|----------|
| 1 | 暂停按钮点击后，计时器继续走约1秒才实际结束录制 |
| 2 | 倒计时最后1s卡很久（3-5秒），工具条才最小化并开始录制 |
| 3 | 倒计时最后1s内点击撤销，UI回退但后台仍会开始录制 |
| 4 | 暂停按钮点击后计时器继续走约1秒多才实际暂停 |

---

## 问题 1 & 4：暂停按钮功能未实现

### 现象
点击暂停按钮后，计时器继续走约1秒多，才实际结束录制。

### 根因分析

**Toolbar.tsx 第 204-210 行**：
```typescript
<button
  onClick={() => setIsPaused(!isPaused)}  // 仅修改本地 UI 状态
  ...
>
  {isPaused ? <Play ... /> : <Pause ... />}
</button>
```

**问题**：`isPaused` 状态仅用于 UI 显示（显示播放/暂停图标），**未触发任何实际的录制暂停逻辑**。

**App.tsx 第 452-454 行**：
```typescript
const unlistenPause = window.caplet.onShortcutTogglePause(() => {
  console.log('[ZapRec] Toggle pause shortcut triggered')
  // 仅打印日志，未实现暂停逻辑
})
```

**问题**：`onShortcutTogglePause` 处理器仅打印日志，**未调用任何暂停/恢复方法**。

**RecordingEngine.ts**：
```typescript
export class RecordingEngine {
  async start(): Promise<void> { ... }
  async stop(): Promise<void> { ... }
  // 缺少 pause() 和 resume() 方法
}
```

**问题**：RecordingEngine **完全没有 pause/resume 实现**。

### 结论
暂停功能的前端 UI 和后端录制引擎均未实现。当前 `isPaused` 仅是视觉占位符。

---

## 问题 2：倒计时最后 1s 卡住 3-5 秒

### 现象
倒计时显示 1s 后，需要等待 3-5 秒工具条才最小化并开始录制。

### 根因分析

**useRecordingCountdown.ts 第 26-29 行**：
```typescript
count--
if (count <= 0) {
  if (timerRef.current) clearInterval(timerRef.current)
  timerRef.current = null
  onComplete()  // 触发 startRecording()
}
```

**App.tsx startRecording() 耗时操作**（第 200-360 行）：
```typescript
const startRecording = useCallback(async () => {
  // ... 大量耗时操作 ...
  
  await recordingEngine.start()  // 启动录制引擎

  setLastSavedPath(filepath)

  setStatus('recording')
  if (currentSettings.autoHide) {
    window.caplet.windowMinimize()  // 最后一步：最小化窗口
  }
}, [...])
```

**问题**：`onComplete()` 调用的 `startRecording()` 是**异步函数**，内部执行：
1. 获取屏幕/窗口流 (`mediaCapturer.startDisplayCapture`)
2. 初始化混音器 (`audioMixer.initialize`)
3. 获取麦克风流 (`mediaCapturer.startMicrophoneCapture`)
4. 恢复音频上下文 (`audioMixer.resume`)
5. 获取混合流 (`audioMixer.getOutputStream`)
6. 添加音视频轨道
7. **启动录制引擎** (`recordingEngine.start`)
8. **最小化窗口** (`window.caplet.windowMinimize`)

这些操作在最后 1s 倒计时内**同步执行**，导致 UI 卡顿。

---

## 问题 3：撤销按钮在最后 1s 内点击不可靠

### 现象
倒计时最后 1s 点击撤销，UI 回退到空闲状态，但后台仍会开始录制。

### 根因分析

**useRecordingCountdown.ts 竞态条件**：
```typescript
timerRef.current = setInterval(() => {
  if (useAppStore.getState().status !== 'countdown') {  // 检查在回调开头
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    return
  }

  count--
  if (count <= 0) {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    onComplete()  // 此时即使 undo 设置了 status='idle'，onComplete 已queued
  } else {
    useAppStore.getState().setCountdownValue(count)
  }
}, 1000)
```

**竞态时序**：
```
时间线：
T=0:     count=1, setInterval 触发
T=0+δ:   检查 status === 'countdown' ✓
T=0+δ:   count-- → count=0
T=0+δ:   onComplete() 被调用 → startRecording() 开始执行
T=0+δ:   同一 tick 内，Toolbar 的 Undo 点击事件触发
T=0+δ:   status 被设为 'idle'
T=0+δ:   但 startRecording() 已经处于执行中状态，无法中止
```

**Toolbar.tsx 撤销逻辑**（第 232-256 行）：
```typescript
onClick={() => {
  const store = useAppStore.getState()
  store.setStatus('idle')  // 设置为 idle
  store.setCountdownValue(0)
  // ... 取消选择逻辑 ...
}}
```

**问题**：当 `status` 变为 `idle` 时，`startRecording()` 可能已经在执行中。React 的状态更新是异步的，无法取消已开始的 Promise 链。

---

## 关键代码位置

| 文件 | 行号 | 说明 |
|------|------|------|
| `src/hooks/useRecordingCountdown.ts` | 7-36 | 倒计时逻辑，存在竞态 |
| `src/App.tsx` | 200-360 | `startRecording()` 异步函数，耗时操作 |
| `src/App.tsx` | 362-432 | `stopRecording()` 停止录制 |
| `src/App.tsx` | 452-454 | `onShortcutTogglePause` 未实现 |
| `src/components/Toolbar.tsx` | 204-210 | 暂停按钮，仅改本地状态 |
| `src/components/Toolbar.tsx` | 232-256 | 撤销按钮 |
| `src/core/RecordingEngine.ts` | 45-165 | 录制引擎，缺少 pause/resume |
| `src/core/MediaCapturer.ts` | 72-211 | 媒体捕获，无暂停能力 |

---

## 待解决问题列表

- [ ] **实现 RecordingEngine.pause() 和 resume() 方法**
- [ ] **实现 App.tsx 中的 togglePause 逻辑**，连接 UI 状态与录制引擎
- [ ] **修复 useRecordingCountdown 竞态条件**，防止撤销后仍开始录制
- [ ] **优化 startRecording() 性能**，减少倒计时结束到实际开始录制的延迟
- [ ] **考虑添加取消令牌（AbortController）机制**，支持取消进行中的录制准备
