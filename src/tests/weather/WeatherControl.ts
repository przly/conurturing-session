import { WEATHER_CONFIG, type WeatherState } from '@/config'
import type { WeatherLook } from '@/shared/scene/weather'

export type WeatherSource = 'script' | 'live' | 'fallback' | 'url' | 'debug'

export interface WeatherChange {
  from: WeatherState | null
  to: WeatherState | null
  isDay: boolean
  transitionSec: number
  source: WeatherSource
  /** Extra details to log with the change. */
  detail?: Record<string, unknown>
}

const smoothstep = (x: number) => x * x * (3 - 2 * x)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/**
 * Which weather the plant shows right now, with smooth changes between
 * states (and between day and night). Real time, so a change always
 * takes `transitionSec` to look at, also in fast mode.
 * `enabled = false` (condition A) shows no weather layer at all.
 */
export class WeatherControl {
  enabled = false
  isDay = true
  /** Where the latest change came from (shown in the debug panel). */
  source: WeatherSource | null = null
  onChange: ((change: WeatherChange) => void) | null = null

  private from: WeatherState = WEATHER_CONFIG.fallbackState
  private to: WeatherState = WEATHER_CONFIG.fallbackState
  private startMs = 0
  private durationMs = 0
  private nightFrom = 0
  private nightTo = 0
  private nightStartMs = 0
  private nightDurationMs = 0

  /** The state it is heading to (or showing). */
  get state(): WeatherState {
    return this.to
  }

  /** 0–1 progress of the current change (1 = settled). */
  progress(now = performance.now()) {
    return this.durationMs ? clamp01((now - this.startMs) / this.durationMs) : 1
  }

  /** Show `state` right away (start of a condition). */
  show(state: WeatherState, isDay: boolean, source: WeatherSource, detail?: Record<string, unknown>) {
    const previous = this.enabled ? this.to : null
    this.enabled = true
    this.from = this.to = state
    this.durationMs = 0
    this.isDay = isDay
    this.nightFrom = this.nightTo = isDay ? 0 : 1
    this.source = source
    this.onChange?.({ from: previous, to: state, isDay, transitionSec: 0, source, detail })
  }

  /** Change to `state` over `seconds` (starts from whatever is on screen now). */
  transitionTo(
    state: WeatherState,
    source: WeatherSource,
    seconds = WEATHER_CONFIG.transitionSec,
    detail?: Record<string, unknown>,
  ) {
    if (!this.enabled) return this.show(state, this.isDay, source, detail)
    const now = performance.now()
    // If a change is still running, continue from the state closest to what's on screen.
    const previous = this.progress(now) < 0.5 ? this.from : this.to
    this.from = previous
    this.to = state
    this.startMs = now
    this.durationMs = seconds * 1000
    this.source = source
    this.onChange?.({ from: previous, to: state, isDay: this.isDay, transitionSec: seconds, source, detail })
  }

  setDay(isDay: boolean, source: WeatherSource, seconds = WEATHER_CONFIG.transitionSec) {
    if (isDay === this.isDay) return
    const now = performance.now()
    this.nightFrom = this.night(now)
    this.nightTo = isDay ? 0 : 1
    this.nightStartMs = now
    this.isDay = isDay
    this.nightDurationMs = seconds * 1000
    this.source = source
    this.onChange?.({ from: this.to, to: this.to, isDay, transitionSec: seconds, source })
  }

  /** No weather layer (condition A, or switched off in the debug panel). */
  disable(source: WeatherSource) {
    if (!this.enabled) return
    this.enabled = false
    this.source = source
    this.onChange?.({ from: this.to, to: null, isDay: this.isDay, transitionSec: 0, source })
  }

  /** Read every frame by the scene. */
  look = (): WeatherLook | null => {
    if (!this.enabled) return null
    const now = performance.now()
    return { from: this.from, to: this.to, mix: smoothstep(this.progress(now)), night: this.night(now) }
  }

  private night(now: number) {
    const p = this.nightDurationMs ? clamp01((now - this.nightStartMs) / this.nightDurationMs) : 1
    return this.nightFrom + (this.nightTo - this.nightFrom) * smoothstep(p)
  }
}
