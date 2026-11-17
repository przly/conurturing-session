import type { RoundConfig } from '@/config'

/**
 * Shared state model. Plant and orb read exactly these values;
 * only the visuals differ.
 */
export interface TwinState {
  /** 0–1: the object's energy. Never below `healthFloor`. */
  health: number
  /** 0–1: jumps to 1 on a partner signal, eases back to 0. */
  pulse: number
  /** Mic currently hears speech. */
  listening: boolean
}

export type RoundEventType =
  | 'round_start'
  | 'talk'
  | 'pulse'
  | 'wither_start'
  | 'wither_end'
  | 'revived'
  | 'round_end'
  | 'health'

export interface RoundEvent {
  type: RoundEventType
  /** Round seconds since round start. */
  t_sec: number
  duration_sec?: number
  health: number
  meta?: Record<string, unknown>
}

export type Source = 'script' | 'manual'

interface RunnerOptions {
  config: RoundConfig
  /** Round seconds per real second (10 with `?fast=1`). */
  speed: number
  onEvent: (event: RoundEvent) => void
  onEnd: () => void
}

const TICK_MS = 50
/** Integration step in round seconds, so fast mode stays accurate. */
const MAX_STEP = 0.1

const smoothstep = (x: number) => x * x * (3 - 2 * x)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/**
 * Runs one round: the clock, the scripted partner pulses and withering,
 * and health dynamics. Uses a timer (not requestAnimationFrame) so the
 * clock keeps time even if the tab is briefly hidden.
 */
export class RoundRunner {
  readonly state: TwinState
  /** Round seconds elapsed. */
  t = 0
  ended = false

  private config: RoundConfig
  private speed: number
  private onEvent: RunnerOptions['onEvent']
  private onEnd: RunnerOptions['onEnd']
  private timer = 0
  private lastReal = 0
  private startReal = 0

  private firedPulses = new Set<number>()
  private pulseAt: number | null = null
  private wither: { start: number; from: number; to: number } | null = null
  private witherDone = false
  private firstTalkAfterWither: number | null = null
  private revived = false
  private lastHealthLog = -1

  constructor(options: RunnerOptions) {
    this.config = options.config
    this.speed = options.speed
    this.onEvent = options.onEvent
    this.onEnd = options.onEnd
    this.state = { health: options.config.startHealth, pulse: 0, listening: false }
  }

  start() {
    this.reset()
    this.lastReal = this.startReal = performance.now()
    this.emit('round_start', { meta: { speed: this.speed } })
    this.logHealth()
    this.timer = window.setInterval(this.tick, TICK_MS)
  }

  stop() {
    clearInterval(this.timer)
    this.timer = 0
  }

  /** Round time at a given `performance.now()` timestamp. */
  roundTimeAt(realMs: number) {
    return Math.max(0, ((realMs - this.startReal) / 1000) * this.speed)
  }

  setListening(listening: boolean) {
    // Note the first talk after withering as it starts (the talk event itself is only logged when it ends).
    if (listening && !this.state.listening) this.noteTalkAfterWither(this.t)
    this.state.listening = listening
  }

  /** A finished talk event from the mic (start time as `performance.now()`, duration in real seconds). */
  logTalk(startRealMs: number, durationRealSec: number) {
    if (this.ended) return
    const t = this.roundTimeAt(startRealMs)
    this.noteTalkAfterWither(t)
    // Duration in round seconds, like t_sec (only differs with ?fast=1).
    this.emit('talk', { t, duration: durationRealSec * this.speed })
  }

  private noteTalkAfterWither(t: number) {
    if (!this.wither || t < this.wither.start) return
    if (this.firstTalkAfterWither === null || t < this.firstTalkAfterWither) this.firstTalkAfterWither = t
  }

  triggerPulse(source: Source = 'manual') {
    if (this.ended) return
    this.pulseAt = this.t
    this.state.pulse = 1
    this.emit('pulse', { meta: { source } })
  }

  triggerWither(source: Source = 'manual') {
    if (this.ended || this.wither) return
    const from = this.state.health
    this.wither = { start: this.t, from, to: Math.min(from, this.config.witherTarget) }
    this.emit('wither_start', { meta: { source } })
  }

  /** End the round now (researcher override). */
  skip() {
    if (!this.ended) this.finish('manual')
  }

  /** Start the round over from 0:00 (researcher override). */
  restart() {
    this.stop()
    this.emit('round_end', { meta: { source: 'manual', restarted: true } })
    this.start()
  }

  private reset() {
    this.t = 0
    this.ended = false
    this.state.health = this.config.startHealth
    this.state.pulse = 0
    this.firedPulses.clear()
    this.pulseAt = null
    this.wither = null
    this.witherDone = false
    this.firstTalkAfterWither = null
    this.revived = false
    this.lastHealthLog = -1
  }

  private tick = () => {
    const now = performance.now()
    let remaining = ((now - this.lastReal) / 1000) * this.speed
    this.lastReal = now
    while (remaining > 0 && !this.ended) {
      const dt = Math.min(MAX_STEP, remaining)
      remaining -= dt
      this.step(dt)
    }
  }

  private step(dt: number) {
    const c = this.config
    const s = this.state
    this.t += dt

    // Scripted partner pulses.
    c.pulsesAtSec.forEach((at, i) => {
      if (this.t >= at && !this.firedPulses.has(i)) {
        this.firedPulses.add(i)
        this.triggerPulse('script')
      }
    })
    // Scripted withering (unless a manual one already happened).
    if (this.t >= c.witherAtSec && !this.wither) this.triggerWither('script')

    // Health.
    const w = this.wither
    if (w && !this.witherDone) {
      // Forced: drop to the target regardless of talking.
      const p = clamp01((this.t - w.start) / c.witherDurationSec)
      s.health = w.from + (w.to - w.from) * smoothstep(p)
      if (p >= 1) {
        this.witherDone = true
        this.emit('wither_end')
      }
    } else {
      if (s.listening) s.health += c.talkGainPerSec * dt
      s.health -= c.decayPerSec * dt
    }
    s.health = Math.min(1, Math.max(c.healthFloor, s.health))

    // Revived: healthy again after the forced wither.
    if (this.witherDone && !this.revived && s.health >= c.reviveThreshold) {
      this.revived = true
      this.emit('revived', {
        meta: {
          since_wither_start: this.t - w!.start,
          first_talk_after_wither_t: this.firstTalkAfterWither,
        },
      })
    }

    // Partner pulse eases back to 0 over pulseLingerSec.
    if (this.pulseAt !== null) {
      const p = clamp01((this.t - this.pulseAt) / c.pulseLingerSec)
      s.pulse = 0.5 * (1 + Math.cos(Math.PI * p))
      if (p >= 1) this.pulseAt = null
    }

    // Health curve, once per round second.
    if (Math.floor(this.t) > this.lastHealthLog) this.logHealth()

    if (this.t >= c.durationSec) this.finish('script')
  }

  private logHealth() {
    this.lastHealthLog = Math.floor(this.t)
    this.emit('health', { meta: { pulse: round3(this.state.pulse), listening: this.state.listening } })
  }

  private finish(source: Source) {
    this.ended = true
    this.stop()
    this.state.listening = false
    this.emit('round_end', { meta: { source } })
    this.onEnd()
  }

  private emit(
    type: RoundEventType,
    extra: { t?: number; duration?: number; meta?: Record<string, unknown> } = {},
  ) {
    this.onEvent({
      type,
      t_sec: round3(extra.t ?? this.t),
      duration_sec: extra.duration !== undefined ? round3(extra.duration) : undefined,
      health: round3(this.state.health),
      meta: extra.meta,
    })
  }
}

function round3(x: number) {
  return Math.round(x * 1000) / 1000
}
