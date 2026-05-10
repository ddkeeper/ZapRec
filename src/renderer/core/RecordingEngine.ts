import {
  Output,
  Mp4OutputFormat,
  StreamTarget,
  MediaStreamVideoTrackSource,
  MediaStreamAudioTrackSource,
  QUALITY_VERY_HIGH,
  type StreamTargetChunk
} from 'mediabunny'

export interface RecordingConfig {
  width: number
  height: number
  fps: number
}

class IPCWritableStream {
  private pendingWrites: Promise<unknown>[] = []

  getWritable(): WritableStream<StreamTargetChunk> {
    return new WritableStream({
      write: async (chunk: StreamTargetChunk) => {
        if (chunk.type === 'write' && window.screenApi) {
          const writePromise = window.screenApi.streamWrite(chunk.data).then(() => {})
          this.pendingWrites.push(writePromise)
          await writePromise
        }
      },
      close: async () => {
        console.log('[RecordingEngine] Stream closing, waiting for writes...')
        await Promise.all(this.pendingWrites)
        console.log('[RecordingEngine] All writes completed')
      },
      abort: (err: Error) => {
        console.error('[RecordingEngine] Stream aborted:', err)
      }
    })
  }

  clear(): void {
    this.pendingWrites = []
  }
}

export class RecordingEngine {
  public taskQueue: Promise<unknown> = Promise.resolve()
  private output: Output | null = null
  private streamTarget: StreamTarget | null = null
  private writableStream: IPCWritableStream | null = null
  private videoSource: MediaStreamVideoTrackSource | null = null
  private audioSource: MediaStreamAudioTrackSource | null = null
  private audioTracks: MediaStreamTrack[] = []
  private isRecording = false
  private isPaused = false
  private currentFilePath: string | null = null
  private baseFilePath: string | null = null
  private segmentIndex = 0
  private _config: RecordingConfig | null = null
  private rawVideoTrack: MediaStreamTrack | null = null
  private rawAudioTrack: MediaStreamTrack | null = null
  private clonedVideoTrack: MediaStreamTrack | null = null  // Track the cloned video track for cleanup

  async initialize(
    config: RecordingConfig,
    _onData: (chunk: Uint8Array) => void
  ): Promise<boolean> {
    try {
      this._config = config
      this.writableStream = new IPCWritableStream()

      this.streamTarget = new StreamTarget(this.writableStream.getWritable(), {
        chunked: false
      })

      this.output = new Output({
        format: new Mp4OutputFormat({
          fastStart: 'in-memory'
        }),
        target: this.streamTarget
      })

      return true
    } catch (error) {
      console.error('Failed to initialize RecordingEngine:', error)
      return false
    }
  }

  initializePaths(basePath: string): string {
    this.baseFilePath = basePath
    this.segmentIndex = 1

    const part1Path = this.generateSegmentPath(this.segmentIndex)
    this.currentFilePath = part1Path
    return part1Path!
  }

  setFilePath(path: string): void {
    this.currentFilePath = path
  }

  getCurrentFilePath(): string | null {
    return this.currentFilePath
  }

  getBaseFilePath(): string | null {
    return this.baseFilePath
  }

  generateSegmentPath(index: number): string | null {
    if (!this.baseFilePath) return null

    const lastSlashIndex = Math.max(
      this.baseFilePath.lastIndexOf('/'),
      this.baseFilePath.lastIndexOf('\\')
    )
    const nameWithExt = lastSlashIndex !== -1
      ? this.baseFilePath.substring(lastSlashIndex + 1)
      : this.baseFilePath

    const dotIndex = nameWithExt.lastIndexOf('.')
    const basename = dotIndex !== -1 ? nameWithExt.substring(0, dotIndex) : nameWithExt
    const ext = dotIndex !== -1 ? nameWithExt.substring(dotIndex) : ''

    if (lastSlashIndex !== -1) {
      const dir = this.baseFilePath.substring(0, lastSlashIndex)
      return `${dir}/${basename}_part${index}${ext}`
    }
    return `${basename}_part${index}${ext}`
  }

  generateNextSegmentPath(): string | null {
    this.segmentIndex++
    return this.generateSegmentPath(this.segmentIndex)
  }

  addVideoTrack(stream: MediaStream, width?: number, height?: number, fps?: number): boolean {
    if (!this.output) return false

    try {
      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) {
        console.error('No video track found')
        return false
      }

      this.rawVideoTrack = videoTrack

      this.videoSource = new MediaStreamVideoTrackSource(videoTrack, {
        codec: 'avc',
        bitrate: QUALITY_VERY_HIGH,
        ...(width && height ? { width, height } : {})
      }, {
        frameRate: fps ?? null
      })

      this.output.addVideoTrack(this.videoSource)
      console.log(`[RecordingEngine] Video track added (${width ?? 'auto'}x${height ?? 'auto'} @ ${fps ?? 'auto'}fps)`)
      return true
    } catch (error) {
      console.error('Failed to add video track:', error)
      return false
    }
  }

  addAudioTrack(stream: MediaStream): boolean {
    if (!this.output) return false

    try {
      const audioTrack = stream.getAudioTracks()[0]
      if (!audioTrack) {
        console.log('No audio track found')
        return false
      }

      this.rawAudioTrack = audioTrack
      this.audioTracks.push(audioTrack)

      this.audioSource = new MediaStreamAudioTrackSource(audioTrack, {
        codec: 'aac',
        bitrate: 128000
      })

      this.output.addAudioTrack(this.audioSource)
      return true
    } catch (error) {
      console.error('Failed to add audio track:', error)
      return false
    }
  }

  async start(): Promise<void> {
    if (!this.output) return

    try {
      await this.output.start()
      this.isRecording = true
      this.isPaused = false
      console.log('[RecordingEngine] Recording started')
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }

  async stopAndSave(): Promise<string | null> {
    this.isRecording = false
    console.log('[RecordingEngine] Stopping and saving...')

    if (this.output) {
      try {
        await this.output.finalize()
        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (error) {
        console.error('Error finalizing output:', error)
      }
      this.output = null
    }

    this.streamTarget = null
    this.writableStream = null
    this.videoSource = null
    this.audioSource = null
    this.audioTracks = []

    const filePath = this.currentFilePath
    this.currentFilePath = null
    return filePath
  }

  async stop(): Promise<void> {
    this.isRecording = false
    console.log('[RecordingEngine] Stopping recording...')

    if (this.output) {
      try {
        await this.output.finalize()
        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (error) {
        console.error('Error finalizing output:', error)
      }
      this.output = null
    }

    this.streamTarget = null
    this.writableStream = null
    this.videoSource = null
    this.audioSource = null
    this.audioTracks = []
  }

  getIsRecording(): boolean {
    return this.isRecording
  }

  async pause(): Promise<string | null> {
    if (!this.isRecording || this.isPaused) return null

    // Stop the cloned video track to prevent multiple active tracks from camera
    if (this.clonedVideoTrack) {
      try {
        this.clonedVideoTrack.stop()
        console.log('[RecordingEngine] Stopped cloned video track before pause')
      } catch (e) {
        // Ignore errors - might already be stopped
      }
      this.clonedVideoTrack = null
    }

    const segmentPath = await this.stopAndSave()
    this.isPaused = true
    console.log('[RecordingEngine] Paused: segment saved', segmentPath)
    return segmentPath
  }

  async resume(): Promise<void> {
    if (!this.isPaused) return

    if (!this._config) {
      console.error('[RecordingEngine] Cannot resume: no config stored')
      return
    }

    try {
      this.writableStream = new IPCWritableStream()
      this.streamTarget = new StreamTarget(this.writableStream.getWritable(), {
        chunked: false
      })
      this.output = new Output({
        format: new Mp4OutputFormat({
          fastStart: 'in-memory'
        }),
        target: this.streamTarget
      })

      if (this.rawVideoTrack) {
        // Stop previous clone if exists (should already be null after pause)
        if (this.clonedVideoTrack) {
          try { this.clonedVideoTrack.stop() } catch (e) {}
        }
        // Create new clone from raw track
        this.clonedVideoTrack = this.rawVideoTrack.clone()
        const config = this._config
        this.videoSource = new MediaStreamVideoTrackSource(
          this.clonedVideoTrack as any,
          {
            codec: 'avc',
            bitrate: QUALITY_VERY_HIGH,
            ...(config ? { width: config.width, height: config.height } : {})
          },
          {
            frameRate: config?.fps ?? null
          }
        )
        this.output.addVideoTrack(this.videoSource)
      }

      if (this.rawAudioTrack) {
        this.audioSource = new MediaStreamAudioTrackSource(
          this.rawAudioTrack as any,
          { codec: 'aac', bitrate: 128000 }
        )
        this.output.addAudioTrack(this.audioSource)
      }

      await this.output.start()
      this.isRecording = true
      this.isPaused = false
      console.log('[RecordingEngine] Resumed: new segment started')
    } catch (error) {
      console.error('[RecordingEngine] Failed to resume:', error)
    }
  }

  getIsPaused(): boolean {
    return this.isPaused
  }

  getSegmentIndex(): number {
    return this.segmentIndex
  }
}

export const recordingEngine = new RecordingEngine()