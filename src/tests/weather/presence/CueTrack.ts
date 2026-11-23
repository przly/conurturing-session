import { SPEED, WEATHER_CONFIG, type ClipNumber } from '@/config'

export interface Cue {
  t: number
  event: 'enter' | 'move' | 'behind' | 'still' | 'pass' | 'leave'
  x?: number
  motion?: { from: number; to: number; seconds: number }
}

export class CueTrack {
  time = 0
  elapsed = 0
  latest: Cue | null = null
  private loop = 0
  private next = 0

  readonly clip: ClipNumber
  readonly video: HTMLVideoElement
  readonly cues: Cue[]
  readonly offset: number

  constructor(clip: ClipNumber, video: HTMLVideoElement, cues: Cue[], offset: number) {
    this.clip = clip
    this.video = video
    this.cues = cues
    this.offset = offset
    this.time = offset
    this.next = cues.filter((cue) => cue.t < offset).length
    this.latest = cues[this.next - 1] ?? null
  }

  update(onCue: (cue: Cue, elapsed: number) => void) {
    const time = this.video.currentTime
    if (time < this.time) {
      this.emitThrough(this.video.duration, onCue)
      this.loop++
      this.next = 0
      this.latest = null
    }
    this.time = time
    this.elapsed = this.loop * this.video.duration + time - this.offset
    this.emitThrough(time, onCue)
    return this.elapsed
  }

  cueTimes() {
    const times: number[] = []
    for (let loop = 0; loop * this.video.duration < this.offset + WEATHER_CONFIG.conditionSec; loop++) {
      for (const cue of this.cues) {
        const t = loop * this.video.duration + cue.t - this.offset
        if (t >= 0 && t <= WEATHER_CONFIG.conditionSec) times.push(t)
      }
    }
    return times
  }

  private emitThrough(time: number, onCue: (cue: Cue, elapsed: number) => void) {
    while (this.next < this.cues.length && this.cues[this.next].t <= time) {
      this.latest = this.cues[this.next++]
      const elapsed = this.loop * this.video.duration + this.latest.t - this.offset
      if (elapsed <= WEATHER_CONFIG.conditionSec) onCue(this.latest, elapsed)
    }
  }
}

export async function loadPresence(clip: ClipNumber, offset: number, signal: AbortSignal, path = `/videos/presence_${clip}`) {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.loop = true
  video.preload = 'auto'
  const timeout = AbortSignal.timeout(WEATHER_CONFIG.fetchTimeoutSec * 1000)
  const loading = AbortSignal.any([signal, timeout])
  const waitFor = (event: 'loadedmetadata' | 'seeked') => new Promise<void>((resolve, reject) => {
    loading.throwIfAborted()
    const listeners = new AbortController()
    const finish = (error?: unknown) => {
      listeners.abort()
      if (error) reject(error)
      else resolve()
    }
    const options = { signal: listeners.signal }
    video.addEventListener(event, () => finish(), options)
    video.addEventListener('error', () => finish(new Error('Presence video failed to load')), options)
    loading.addEventListener('abort', () => finish(loading.reason), options)
  })
  const clear = () => {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  signal.addEventListener('abort', clear, { once: true })
  try {
    const metadata = waitFor('loadedmetadata')
    video.src = path + '.mp4'
    const [raw] = await Promise.all([
      fetch(path + '.cues.json', { signal: loading }).then((response) => {
        if (!response.ok) throw new Error('Presence cues failed to load')
        return response.json() as Promise<unknown>
      }),
      metadata,
    ])
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !Array.isArray(raw)) throw new Error('Invalid presence track')
    const cues = raw.map((cue, i): Cue => {
      if (
        !cue || typeof cue.t !== 'number' || !Number.isFinite(cue.t) || cue.t < 0 || cue.t >= video.duration ||
        (i > 0 && cue.t < raw[i - 1].t) || !['enter', 'move', 'behind', 'still', 'pass', 'leave'].includes(cue.event) ||
        (cue.motion !== undefined && (
          !cue.motion || !Number.isFinite(cue.motion.from) || !Number.isFinite(cue.motion.to) ||
          !Number.isFinite(cue.motion.seconds) || cue.motion.seconds <= 0
        )) ||
        (cue.x !== undefined && (typeof cue.x !== 'number' || !Number.isFinite(cue.x) || cue.x < 0 || cue.x > 1))
      ) throw new Error(`Invalid presence cue ${i + 1}`)
      return { t: cue.t, event: cue.event, x: cue.x, motion: cue.motion }
    })
    const start = ((offset % video.duration) + video.duration) % video.duration
    if (start > 0) {
      const seeked = waitFor('seeked')
      video.currentTime = start
      await seeked
    }
    video.playbackRate = SPEED
    return new CueTrack(clip, video, cues, video.currentTime)
  } catch (error) {
    clear()
    throw error
  }
}

/** Identical timed stimulus in every participant viewing. */
export function loadRecordedPresence(signal: AbortSignal) {
  return loadPresence(1, 0, signal, `/videos/${WEATHER_CONFIG.presence.recording}`)
}
