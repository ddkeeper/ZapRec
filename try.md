# ZapRec AI 降噪与回声消除集成方案 (RNNoise WASM)

## 1. 方案概述
通过引入 `RNNoise` (基于 RNN 的轻量级降噪算法) 的 WebAssembly 版本，利用 `AudioWorklet` 在独立线程处理麦克风音频。该方案无需参考信号即可识别并抑制非人声（回声、底噪、击键声）。

---

## 2. 静态资源准备
由于 WASM 和 Worklet 脚本不能被 Vite 直接打包混淆，必须存放在 `public` 目录：

1. **存放路径**：
   ```text
   zaprec/
   └── public/
       ├── rnnoise.wasm           # RNNoise 核心编译文件
       └── rnnoise-processor.js    # AudioWorklet 处理器逻辑
   ```

2. **rnnoise-processor.js 实现逻辑**：
   *该脚本需处理 128 采样点（Web Audio 标准）到 480 采样点（RNNoise 标准）的缓冲区转换。*

---

## 3. 核心代码实现

### 3.1 AudioMixer.ts 重构
**位置**: `src/core/AudioMixer.ts`
主要改动：在初始化时加载模块，并在添加麦克风流时接入 `AudioWorkletNode`。

~~~typescript
export class AudioMixer {
  private audioContext: AudioContext | null = null
  private sourceNodes: Map<string, MediaStreamAudioSourceNode> = new Map()
  private gainNodes: Map<string, GainNode> = new Map()
  private rnnoiseNode: AudioWorkletNode | null = null
  private compressorNode: DynamicsCompressorNode | null = null
  private destinationNode: MediaStreamAudioDestinationNode | null = null

  async initialize(): Promise<void> {
    if (this.audioContext && this.audioContext.state !== 'closed') return
    
    this.audioContext = new AudioContext({ sampleRate: 48000 })
    
    try {
      // 加载 AI 降噪处理器 (注意：Vite 环境下使用相对路径)
      await this.audioContext.audioWorklet.addModule('rnnoise-processor.js')
      console.log('[ZapRec] RNNoise Worklet loaded')
    } catch (e) {
      console.error('[ZapRec] Failed to load RNNoise Worklet:', e)
    }

    this.destinationNode = this.audioContext.createMediaStreamDestination()
    
    this.compressorNode = this.audioContext.createDynamicsCompressor()
    this.compressorNode.threshold.value = -10.0
    this.compressorNode.knee.value = 15
    this.compressorNode.ratio.value = 3.5
    this.compressorNode.attack.value = 0.003
    this.compressorNode.release.value = 0.1
    this.compressorNode.connect(this.destinationNode)
  }

  addStream(stream: MediaStream, name: string): MediaStream | null {
    if (!this.audioContext || !this.destinationNode || !this.compressorNode) return null

    this.removeStream(name)
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) return null

    const sourceNode = this.audioContext.createMediaStreamSource(new MediaStream(audioTracks))
    const gainNode = this.audioContext.createGain()

    if (name === 'microphone') {
      try {
        // 创建 AI 降噪节点
        this.rnnoiseNode = new AudioWorkletNode(this.audioContext, 'rnnoise-processor')
        
        // 链路：麦克风源 -> AI 降噪 -> 增益 -> 压缩器
        sourceNode.connect(this.rnnoiseNode)
        this.rnnoiseNode.connect(gainNode)
      } catch (e) {
        // 降级逻辑：Worklet 失败则直接连通
        sourceNode.connect(gainNode)
      }
      gainNode.gain.value = 1.0
    } else if (name === 'system') {
      gainNode.gain.value = 0.65
      sourceNode.connect(gainNode)
    }

    gainNode.connect(this.compressorNode)
    this.sourceNodes.set(name, sourceNode)
    this.gainNodes.set(name, gainNode)

    return this.destinationNode.stream
  }

  removeStream(name: string): void {
    if (name === 'microphone' && this.rnnoiseNode) {
      this.rnnoiseNode.disconnect()
      this.rnnoiseNode = null
    }
    const sourceNode = this.sourceNodes.get(name)
    const gainNode = this.gainNodes.get(name)
    sourceNode?.disconnect()
    gainNode?.disconnect()
    this.sourceNodes.delete(name)
    this.gainNodes.delete(name)
  }

  // ... 保持 setGain, getOutputStream, resume, destroy 不变 ...
}
~~~

---

## 4. 环境与打包配置 (Vite)

### 4.1 相对路径修正 (vite.config.ts)
确保生产环境下静态资源寻址正确。
```typescript
export default defineConfig({
  base: './', // 必须使用相对路径，否则生产环境 file:// 协议下无法找到 WASM
  // ... 其他配置
})
```

### 4.2 安全策略放行 (index.html)
必须允许 WASM 在渲染进程中执行。
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:;">
```

---

## 5. 调试建议
1. **采样率对齐**：RNNoise 最佳性能在 48kHz。确保 `AudioContext` 初始化时指定了 `sampleRate: 48000`。
2. **监听回声**：在测试时，尝试不戴耳机大音量播放音乐并同时开启麦克风录制。回声应被抑制到肉耳难以察觉的程度，而人声保持自然。
3. **性能监控**：在 Chrome DevTools 的 Performance 选项卡中观察 `AudioWorklet` 的执行耗时，确保其远低于 2.6ms (128 samples @ 48kHz 的处理时限)。