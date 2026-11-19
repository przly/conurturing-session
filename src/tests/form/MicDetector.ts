import { MIC_CONFIG } from '@/config'

/**
 * Talk detection with the Web Audio API.
 *
 * Privacy: audio never leaves this class. We only read the loudness
 * (RMS, in dB) of each short frame and turn it into "speaking / not
 * speaking". Nothing is recorded, stored or sent.
 */

export interface Calibration {
  noiseDb: number
  speechDb: number
  onDb: number
  offDb: number
  /** Speech was clearly louder than silence. */
  reliable: boolean
}

export interface TalkEvent {
  /** `performance.now()` when speech started. */
  startMs: number
  durationSec: number
}

export type MicErrorKind = 'denied' | 'no-device' | 'unsupported' | 'other'

export class MicError extends Error {
  kind: MicErrorKind
  constructor(kind: MicErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

const FRAME_MS = 20
/** Level smoothing time constant, seconds. */
const SMOOTH_SEC = 0.06
const MIN_DB = -100

export class MicDetector {
  /** Smoothed level of the latest frame, dB (−100…0). */
  level = MIN_DB
  /**
   * 0–1 loudness while a talk is in progress (0 when quiet): from the
   * off-threshold (0) to `voiceHeadroomDb` above their calibrated speech level (1).
   */
  voice = 0
  /** Talk in progress for at least `minTalkSec`. */
  listening = false
  calibration: Calibration | null = null

  /** Fires when `listening` changes. */
  onListening: ((listening: boolean) => void) | null = null
  /** Fires when a talk event ends (only events ≥ `minTalkSec`). */
  onTalk: ((event: TalkEvent) => void) | null = null

  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private buffer: Float32Array<ArrayBuffer> | null = null
  private timer = 0
  private minTalkSec: number

  // Hysteresis state.
  private active = false
  private activeStart = 0
  private lastAbove = 0

  constructor(minTalkSec: number) {
    this.minTalkSec = minTalkSec
  }

  /** Ask for the microphone. Must be called from a user gesture (Safari). */
  async start() {
    if (this.stream) return
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicError('unsupported', 'This browser cannot use the microphone (use Chrome or Safari over https).')
    }
    // Create the context inside the gesture so it is allowed to run.
    this.context = new AudioContext()
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      })
    } catch (error) {
      this.context.close()
      this.context = null
      const name = (error as DOMException)?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new MicError('denied', 'Microphone access was blocked.')
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        throw new MicError('no-device', 'No microphone was found.')
      }
      throw new MicError('other', String((error as Error)?.message ?? error))
    }
    await this.context.resume()
    const source = this.context.createMediaStreamSource(this.stream)
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 1024
    this.buffer = new Float32Array(this.analyser.fftSize)
    // Analyser only; not connected to the speakers or anything else.
    source.connect(this.analyser)
    this.timer = window.setInterval(this.frame, FRAME_MS)
  }

  stop() {
    clearInterval(this.timer)
    this.timer = 0
    this.endTalk()
    this.voice = 0
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.context?.close()
    this.context = null
    this.analyser = null
  }

  /** Measure the level for `seconds` and return a robust summary (percentile, dB). */
  async measure(seconds: number, percentile: number, onProgress?: (p: number) => void): Promise<number> {
    const samples: number[] = []
    const start = performance.now()
    await new Promise<void>((resolve) => {
      const id = window.setInterval(() => {
        samples.push(this.level)
        const p = (performance.now() - start) / (seconds * 1000)
        onProgress?.(Math.min(1, p))
        if (p >= 1) {
          clearInterval(id)
          resolve()
        }
      }, FRAME_MS)
    })
    samples.sort((a, b) => a - b)
    return samples[Math.floor((samples.length - 1) * percentile)] ?? MIN_DB
  }

  /** Set thresholds from a silence level and a speech level. */
  setCalibration(noiseDb: number, speechDb: number): Calibration {
    const gap = Math.max(0, speechDb - noiseDb)
    // With a weak gap still keep thresholds a few dB above the noise.
    const span = Math.max(gap, MIC_CONFIG.minGapDb)
    this.calibration = {
      noiseDb,
      speechDb,
      onDb: noiseDb + span * MIC_CONFIG.onRatio,
      offDb: noiseDb + span * MIC_CONFIG.offRatio,
      reliable: gap >= MIC_CONFIG.minGapDb,
    }
    return this.calibration
  }

  private frame = () => {
    if (!this.analyser || !this.buffer) return
    this.analyser.getFloatTimeDomainData(this.buffer)
    let sum = 0
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] * this.buffer[i]
    const rms = Math.sqrt(sum / this.buffer.length)
    const db = rms > 0 ? Math.max(MIN_DB, 20 * Math.log10(rms)) : MIN_DB
    const k = 1 - Math.exp(-FRAME_MS / 1000 / SMOOTH_SEC)
    this.level += (db - this.level) * k
    if (this.calibration) {
      this.detect(performance.now())
      const { offDb, speechDb } = this.calibration
      const top = Math.max(speechDb, offDb + MIC_CONFIG.minGapDb) + MIC_CONFIG.voiceHeadroomDb
      const v = (this.level - offDb) / (top - offDb)
      this.voice = this.active ? Math.min(1, Math.max(0, v)) : 0
    }
  }

  private detect(now: number) {
    const { onDb, offDb } = this.calibration!
    if (!this.active) {
      if (this.level >= onDb) {
        this.active = true
        this.activeStart = this.lastAbove = now
      }
      return
    }
    if (this.level >= offDb) this.lastAbove = now
    const duration = (this.lastAbove - this.activeStart) / 1000
    if (!this.listening && duration >= this.minTalkSec) this.setListening(true)
    // Hangover: short pauses inside a sentence don't split the event.
    if (now - this.lastAbove > MIC_CONFIG.hangoverSec * 1000) this.endTalk()
  }

  private endTalk() {
    if (!this.active) return
    this.active = false
    const durationSec = (this.lastAbove - this.activeStart) / 1000
    if (this.listening) this.setListening(false)
    if (durationSec >= this.minTalkSec) this.onTalk?.({ startMs: this.activeStart, durationSec })
  }

  private setListening(listening: boolean) {
    this.listening = listening
    this.onListening?.(listening)
  }
}
