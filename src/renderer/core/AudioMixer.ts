export class AudioMixer {
  private audioContext: AudioContext | null = null
  private sourceNodes: Map<string, MediaStreamAudioSourceNode> = new Map()
  private highpassFilterNodes: Map<string, BiquadFilterNode> = new Map()
  private deEsserFilterNodes: Map<string, BiquadFilterNode> = new Map()
  private lowpassFilterNodes: Map<string, BiquadFilterNode> = new Map()
  private gainNodes: Map<string, GainNode> = new Map()
  private compressorNode: DynamicsCompressorNode | null = null
  private destinationNode: MediaStreamAudioDestinationNode | null = null

  async initialize(): Promise<void> {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      return
    }
    
    this.audioContext = new AudioContext({ sampleRate: 48000 })
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
    if (!this.audioContext || !this.destinationNode || !this.compressorNode) {
      console.error('AudioMixer not initialized')
      return null
    }

    this.removeStream(name)

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      return null
    }

    const audioStream = new MediaStream(audioTracks)
    const sourceNode = this.audioContext.createMediaStreamSource(audioStream)
    const gainNode = this.audioContext.createGain()

    if (name === 'microphone') {
      const highpass = this.audioContext.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 70

      const deEsser = this.audioContext.createBiquadFilter()
      deEsser.type = 'peaking'
      deEsser.frequency.value = 6000
      deEsser.Q.value = 2.0
      deEsser.gain.value = -3.0

      const lowpass = this.audioContext.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 12000

      gainNode.gain.value = 1.0

      sourceNode.connect(highpass)
      highpass.connect(deEsser)
      deEsser.connect(lowpass)
      lowpass.connect(gainNode)
      gainNode.connect(this.compressorNode)

      this.highpassFilterNodes.set(name, highpass)
      this.deEsserFilterNodes.set(name, deEsser)
      this.lowpassFilterNodes.set(name, lowpass)
    } else if (name === 'system') {
      gainNode.gain.value = 0.65
      sourceNode.connect(gainNode)
      gainNode.connect(this.compressorNode)
    }

    this.sourceNodes.set(name, sourceNode)
    this.gainNodes.set(name, gainNode)

    return this.destinationNode.stream
  }

  removeStream(name: string): void {
    const sourceNode = this.sourceNodes.get(name)
    const highpass = this.highpassFilterNodes.get(name)
    const deEsser = this.deEsserFilterNodes.get(name)
    const lowpass = this.lowpassFilterNodes.get(name)
    const gainNode = this.gainNodes.get(name)

    if (sourceNode) {
      sourceNode.disconnect()
      this.sourceNodes.delete(name)
    }

    if (highpass) {
      highpass.disconnect()
      this.highpassFilterNodes.delete(name)
    }

    if (deEsser) {
      deEsser.disconnect()
      this.deEsserFilterNodes.delete(name)
    }

    if (lowpass) {
      lowpass.disconnect()
      this.lowpassFilterNodes.delete(name)
    }

    if (gainNode) {
      gainNode.disconnect()
      this.gainNodes.delete(name)
    }
  }

  setGain(name: string, value: number): void {
    const gainNode = this.gainNodes.get(name)
    if (gainNode && this.audioContext) {
      gainNode.gain.exponentialRampToValueAtTime(
        Math.max(value, 0.0001),
        this.audioContext.currentTime + 0.05
      )
    }
  }

  getOutputStream(): MediaStream | null {
    return this.destinationNode?.stream || null
  }

  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume()
    }
  }

  async suspend(): Promise<void> {
    if (this.audioContext?.state === 'running') {
      await this.audioContext.suspend()
    }
  }

  destroy(): void {
    this.sourceNodes.forEach((node) => node.disconnect())
    this.highpassFilterNodes.forEach((node) => node.disconnect())
    this.deEsserFilterNodes.forEach((node) => node.disconnect())
    this.lowpassFilterNodes.forEach((node) => node.disconnect())
    this.gainNodes.forEach((node) => node.disconnect())
    this.destinationNode?.stream.getTracks().forEach(track => track.stop())
    
    if (this.compressorNode) {
      this.compressorNode.disconnect()
      this.compressorNode = null
    }
    
    this.sourceNodes.clear()
    this.highpassFilterNodes.clear()
    this.deEsserFilterNodes.clear()
    this.lowpassFilterNodes.clear()
    this.gainNodes.clear()
    this.destinationNode = null
    
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

export const audioMixer = new AudioMixer()
