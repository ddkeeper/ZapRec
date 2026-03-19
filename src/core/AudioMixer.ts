export class AudioMixer {
  private audioContext: AudioContext | null = null
  private sourceNodes: Map<string, MediaStreamAudioSourceNode> = new Map()
  private gainNodes: Map<string, GainNode> = new Map()
  private destinationNode: MediaStreamAudioDestinationNode | null = null

  async initialize(): Promise<void> {
    if (this.audioContext) {
      return
    }
    
    this.audioContext = new AudioContext()
    this.destinationNode = this.audioContext.createMediaStreamDestination()
  }

  addStream(stream: MediaStream, name: string): MediaStream | null {
    if (!this.audioContext || !this.destinationNode) {
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

    sourceNode.connect(gainNode)
    gainNode.connect(this.destinationNode)

    this.sourceNodes.set(name, sourceNode)
    this.gainNodes.set(name, gainNode)

    return this.destinationNode.stream
  }

  removeStream(name: string): void {
    const sourceNode = this.sourceNodes.get(name)
    const gainNode = this.gainNodes.get(name)

    if (sourceNode) {
      sourceNode.disconnect()
      this.sourceNodes.delete(name)
    }

    if (gainNode) {
      gainNode.disconnect()
      this.gainNodes.delete(name)
    }
  }

  setGain(name: string, value: number): void {
    const gainNode = this.gainNodes.get(name)
    if (gainNode) {
      gainNode.gain.value = value
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
    this.gainNodes.forEach((node) => node.disconnect())
    this.destinationNode?.stream.getTracks().forEach(track => track.stop())
    
    this.sourceNodes.clear()
    this.gainNodes.clear()
    this.destinationNode = null
    
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

export const audioMixer = new AudioMixer()
