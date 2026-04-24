# Toolbar UI 问题与代码文档

## 问题 1：三条竖线粗细不统一

### 问题代码位置

| 分割线 | 文件 | 行号 |
|--------|------|------|
| 分割线1 | Toolbar.tsx | 162 |
| 分割线2 | Toolbar.tsx | 273 |
| 分割线3 | Toolbar.tsx | 335 |

### 相关代码

**Toolbar.tsx 第 162 行**
```tsx
<div className="h-8 bg-white/30 mx-3 shrink-0" style={{ width: 1 }} />
```

**Toolbar.tsx 第 273 行**
```tsx
<div className="h-8 bg-white/30 mx-3 shrink-0" style={{ width: 1 }} />
```

**Toolbar.tsx 第 335 行**
```tsx
<div className="h-8 bg-white/30 mx-3 shrink-0" style={{ width: 1 }} />
```

---

## 问题 2：工具条右侧点击遮挡

### 问题代码位置

Toolbar.tsx 第 135-145 行（Toolbar 最外层容器）

### 相关代码

**Toolbar.tsx 完整 return 语句（第 135-347 行）**
```tsx
return (
  <div 
    className="inline-flex items-center h-14 px-3 rounded-2xl overflow-hidden select-none transition-all duration-300"
    style={{
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(48px)',
      WebkitBackdropFilter: 'blur(48px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      WebkitAppRegion: 'drag',
    } as React.CSSProperties}
  >
    {/* 左侧：设置按钮 - 始终显示 */}
    <button
      onClick={() => {}}
      disabled={isRecording}
      className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0 ${
        isRecording 
          ? 'text-white/30 cursor-not-allowed' 
          : 'hover:bg-white/10 text-white/90'
      }`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      title="设置"
    >
      <Settings size={18} strokeWidth={2} color={isRecording ? 'rgba(255,255,255,0.3)' : 'white'} />
    </button>

    {/* 分割线1 */}
    <div className="h-8 bg-white/30 mx-3 shrink-0" style={{ width: 1 }} />

    {/* 中间：录制源 或 计时器+控制 */}
    <div className="flex items-center justify-center gap-1 min-w-[220px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {status === 'recording' || status === 'paused' ? (
        <>
          {/* 计时器 */}
          <div className="flex items-center gap-2 mr-2">
            <div 
              className="w-2.5 h-2.5 rounded-full"
              style={{ 
                backgroundColor: status === 'paused' ? '#fbbf24' : '#ef4444',
                boxShadow: status === 'paused' 
                  ? '0 0 8px rgba(251,191,36,0.8)' 
                  : '0 0 8px rgba(239,68,68,0.8)'
              }}
            />
            <span className="font-mono text-white text-sm font-medium tracking-wide">
              {formatTime(recordingTime)}
            </span>
          </div>
          {/* 暂停/恢复 */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-2 rounded-md hover:bg-white/10 text-white/90 transition-colors"
            title={isPaused ? "恢复" : "暂停"}
          >
            {isPaused ? <Play size={16} strokeWidth={2} /> : <Pause size={16} strokeWidth={2} />}
          </button>
          {/* 停止 */}
          <button
            onClick={handleRecordToggle}
            className="p-2 rounded-md hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-colors"
            title="停止录制"
          >
            <Square size={16} strokeWidth={2} fill="currentColor" />
          </button>
        </>
      ) : status === 'countdown' ? (
        <div className="flex items-center gap-4 mr-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
            <span className="font-mono text-yellow-400 text-sm font-medium tracking-wide">
              即将开始: {countdownValue}s
            </span>
          </div>
          
          <div className="flex items-center gap-2 border-l border-white/10 pl-3">
            <button
              onClick={() => {
                const store = useAppStore.getState()
                store.setStatus('idle')
                store.setCountdownValue(0)
                if (store.selectedSource === 'area') {
                  window.caplet.cancelAreaSelection()
                  store.setPendingAreaSelection(null)
                } else if (store.selectedSource === 'window') {
                  window.caplet.cancelWindowPicker()
                  store.setSelectedWindow(null)
                  if (store.savedPipEnabled) {
                    store.setPipEnabled(true)
                  }
                  store.setSavedPipEnabled(null)
                  store.setPipButtonDisabled(false)
                } else if (store.selectedSource === 'camera') {
                  store.setPendingCameraSettings(null)
                  if (store.savedPipEnabled) {
                    store.setPipEnabled(true)
                  }
                  store.setSavedPipEnabled(null)
                  store.setPipButtonDisabled(false)
                }
              }}
              className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-all"
              title="返回上一步 (Esc)"
            >
              <Undo2 size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* 录制源按钮 */
        (['display', 'window', 'area', 'camera'] as const).map((source) => {
          const IconComponent = sourceIcons[source]
          const titles: Record<RecordingSource, string> = {
            display: '录制整个屏幕',
            window: '录制指定窗口',
            area: '录制屏幕区域',
            camera: '仅录制摄像头'
          }
          return (
            <button
              key={source}
              onClick={() => handleSourceClick(source)}
              className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-all hover:bg-white/10"
              title={titles[source]}
            >
              <IconComponent size={18} strokeWidth={2} color="rgba(255,255,255,0.9)" />
              <span className="text-xs mt-0.5 text-white/90 font-medium">
                {sourceLabels[source]}
              </span>
            </button>
          )
        })
      )}
    </div>

    {/* 分割线2 */}
    <div className="h-8 bg-white/30 mx-3 shrink-0" style={{ width: 1 }} />

    {/* 右侧：音频开关 - 始终显示 */}
    <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => {
          const newValue = !microphoneEnabled
          setMicrophoneEnabled(newValue)
          if (status === 'recording' || status === 'countdown') {
            audioMixer.setGain('microphone', newValue ? 1 : 0)
          }
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all shrink-0 hover:bg-white/10"
        title={microphoneEnabled ? "麦克风：关闭" : "麦克风：开启"}
      >
        {microphoneEnabled
          ? <Mic size={18} strokeWidth={2} color="white" />
          : <MicOff size={18} strokeWidth={2} color="rgba(255,255,255,0.4)" />
        }
        <span className={`text-sm whitespace-nowrap font-medium ${microphoneEnabled ? 'text-white' : 'text-white/40'}`}>
          麦克风
        </span>
      </button>

      <button
        onClick={() => {
          const newValue = !systemAudioEnabled
          setSystemAudioEnabled(newValue)
          if (status === 'recording' || status === 'countdown') {
            audioMixer.setGain('system', newValue ? 1 : 0)
          }
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all shrink-0 hover:bg-white/10"
        title={systemAudioEnabled ? "系统声音：关闭" : "系统声音：开启"}
      >
        {systemAudioEnabled
          ? <Volume2 size={18} strokeWidth={2} color="white" />
          : <VolumeX size={18} strokeWidth={2} color="rgba(255,255,255,0.4)" />
        }
        <span className={`text-sm whitespace-nowrap font-medium ${systemAudioEnabled ? 'text-white' : 'text-white/40'}`}>
          系统音
        </span>
      </button>

      <button
        onClick={() => !pipButtonDisabled && setPipEnabled(!pipEnabled)}
        disabled={pipButtonDisabled}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all shrink-0 ${
          pipButtonDisabled
            ? 'opacity-30 cursor-not-allowed'
            : 'hover:bg-white/10'
        }`}
        title={pipButtonDisabled ? "录制中不可用" : pipEnabled ? "画中画：关闭" : "画中画：开启"}
      >
        <SquareUser size={18} strokeWidth={2} color={pipEnabled && !pipButtonDisabled ? 'white' : 'rgba(255,255,255,0.4)'} />
        <span className={`text-sm whitespace-nowrap font-medium ${pipEnabled && !pipButtonDisabled ? 'text-white' : 'text-white/40'}`}>
          画中画
        </span>
      </button>
    </div>

    {/* 分割线3 */}
    <div className="h-8 bg-white/30 mx-3 shrink-0" style={{ width: 1 }} />

    {/* 关闭按钮 */}
    <button
      onClick={() => window.caplet.windowMinimize()}
      className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/10 text-white/90 transition-colors shrink-0"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      title="最小化到托盘"
    >
      <X size={18} strokeWidth={2} />
    </button>
  </div>
)
```
