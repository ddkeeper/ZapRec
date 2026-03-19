import {
  Output,
  Mp4OutputFormat,
  StreamTarget,
  MediaStreamVideoTrackSource,
  MediaStreamAudioTrackSource,
  QUALITY_HIGH,
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
        if (chunk.type === 'write' && window.caplet) {
          const writePromise = window.caplet.streamWrite(chunk.data).then(() => {})
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
  private output: Output | null = null
  private streamTarget: StreamTarget | null = null
  private writableStream: IPCWritableStream | null = null
  private videoSource: MediaStreamVideoTrackSource | null = null
  private audioSource: MediaStreamAudioTrackSource | null = null
  private isRecording = false

  async initialize(
    _config: RecordingConfig,
    _onData: (chunk: Uint8Array) => void
  ): Promise<boolean> {
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

      return true
    } catch (error) {
      console.error('Failed to initialize RecordingEngine:', error)
      return false
    }
  }

  addVideoTrack(stream: MediaStream, width?: number, height?: number): boolean {
    if (!this.output) return false

    try {
      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) {
        console.error('No video track found')
        return false
      }

      // 显式传入 width/height，强制 WebCodecs 编码器按选区尺寸初始化
      // 不传则由编码器自动从 track 的 settings 中读取（全屏/窗口模式）
      this.videoSource = new MediaStreamVideoTrackSource(videoTrack, {
        codec: 'avc',
        bitrate: QUALITY_HIGH,
        ...(width && height ? { width, height } : {})
      })

      this.output.addVideoTrack(this.videoSource)
      console.log(`[RecordingEngine] Video track added (${width ?? 'auto'}x${height ?? 'auto'})`)
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
      console.log('[RecordingEngine] Recording started')
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }

  async stop(): Promise<void> {
    this.isRecording = false
    console.log('[RecordingEngine] Stopping recording...')

    if (this.output) {
      try {
        await this.output.finalize()
        console.log('[RecordingEngine] Recording finalized, waiting for writes...')
        await new Promise(resolve => setTimeout(resolve, 1000))
        console.log('[RecordingEngine] All writes should be complete now')
      } catch (error) {
        console.error('Error finalizing output:', error)
      }
      this.output = null
    }

    this.streamTarget = null
    this.writableStream = null
    this.videoSource = null
    this.audioSource = null
  }

  getIsRecording(): boolean {
    return this.isRecording
  }
}

export const recordingEngine = new RecordingEngine()
