const TICK_MS = 50

interface ClockOptions {
  durationSec: number
  /** Condition seconds per real second (10 with `?fast=1`). */
  speed: number
  /** Called every tick with the condition time (presence and weather hook in here). */
  onTick?: (t: number) => void
  readTime?: () => number
  onEnd: () => void
}

/**
 * Clock for one condition. Uses a timer (not requestAnimationFrame) so it
 * keeps time even if the tab is briefly hidden, like the form test's RoundRunner.
 */
export class ConditionClock {
  /** Condition seconds elapsed. */
  t = 0
  ended = false
  readonly durationSec: number
  private speed: number
  private onTick: ClockOptions['onTick']
  private readTime: ClockOptions['readTime']
  private onEnd: ClockOptions['onEnd']
  private timer = 0
  private startReal = 0

  constructor(options: ClockOptions) {
    this.durationSec = options.durationSec
    this.speed = options.speed
    this.onTick = options.onTick
    this.readTime = options.readTime
    this.onEnd = options.onEnd
  }

  start() {
    this.startReal = performance.now()
    this.timer = window.setInterval(this.tick, TICK_MS)
  }

  get remainingSec() {
    return this.ended ? 0 : Math.max(0, this.durationSec - Math.max(this.t, this.wallTime))
  }

  stop() {
    clearInterval(this.timer)
    this.timer = 0
  }

  /** End now (researcher skip). */
  finish() {
    if (this.ended) return
    this.ended = true
    this.stop()
    this.onEnd()
  }

  private get wallTime() {
    return this.timer ? ((performance.now() - this.startReal) / 1000) * this.speed : 0
  }

  private tick = () => {
    const wallTime = this.wallTime
    const playbackTime = this.readTime?.() ?? wallTime
    this.t = wallTime >= this.durationSec ? this.durationSec : Math.min(this.durationSec, playbackTime)
    this.onTick?.(this.t)
    if (this.t >= this.durationSec) this.finish()
  }
}
