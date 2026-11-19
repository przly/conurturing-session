import {
  SPEED,
  URL_PARAMS,
  WEATHER_CONFIG,
  type ClipNumber,
  type SessionConfig,
  type WeatherCondition,
  type WeatherState,
} from '@/config'
import { openParticipantChannel, type Command, type Phase } from '@/shared/data/live'
import { SessionLogger, type AnswerRow } from '@/shared/data/logger'
import type { StartDetails } from './components/StartScreen'
import { ConditionClock } from './ConditionClock'
import { fetchCurrentWeather, stateForCode, type CurrentWeather } from './forecast'
import type { CueTrack } from './presence/CueTrack'
import { scheduleChanges, type ScheduledChange } from './schedule'
import { WeatherControl, type WeatherSource } from './WeatherControl'
import type { Personal } from './text'

export type WeatherEventType =
  | 'consent'
  | 'intro_start'
  | 'intro_end'
  | 'comprehension_answer'
  | 'condition_start'
  | 'presence_cue'
  | 'weather_state'
  | 'weather_transition'
  | 'weather_fetch_failed'
  | 'condition_end'

/** The weather a B/C condition starts with (fetched on the framing screen, before Begin). */
export interface PreparedWeather {
  state: WeatherState
  isDay: boolean
  source: Extract<WeatherSource, 'live' | 'fallback' | 'url'>
  place: { name: string; lat: number | null; lon: number | null }
  data: CurrentWeather | null
  /** Why live weather couldn't be used (source 'fallback'). */
  error: string | null
}

/** The scripted changes of the running condition, and which have happened. */
export interface WeatherScript {
  real: WeatherState
  nearby: WeatherState
  changes: (ScheduledChange & { to: WeatherState; done: boolean })[]
}

/**
 * One Weather test session: owns the logger, the live link to the admin
 * panel and the running condition. No microphone. React drives it through
 * the phases; it never touches the DOM.
 */
export class WeatherSession {
  readonly id: string
  /** Local preview (`?test=weather`): nothing is saved or sent. */
  readonly preview: boolean
  readonly config: SessionConfig
  readonly logger: SessionLogger
  personal: Personal = { familyName: null, hometown: null }
  hometownCoords: { lat: number; lon: number } | null = null
  phase: Phase = 'start'
  /** 1-based position of the current (or last) condition; 0 before the first. */
  position = 0
  clock: ConditionClock | null = null
  /** What the weather layer shows (A: off; B/C: a state). The debug panel drives it too. */
  readonly weather = new WeatherControl()
  /** Weather of the current/last condition (null in A). */
  prepared: PreparedWeather | null = null
  /** Scripted changes of the current condition (null in A, or with `?weather=`). */
  script: WeatherScript | null = null
  track: CueTrack | null = null
  private preparing = new Map<number, Promise<PreparedWeather | null>>()

  private live: ReturnType<typeof openParticipantChannel> = null
  private statusTimer = 0
  private wakeLock: WakeLockSentinel | null = null

  constructor(sessionId: string | null, config: SessionConfig) {
    this.preview = sessionId === null
    this.id = sessionId ?? crypto.randomUUID()
    this.config = config
    this.logger = new SessionLogger(this.id, { local: this.preview })
    // Log every weather change made during a condition (script, live data, ?weather= or debug panel).
    this.weather.onChange = (change) => {
      if (!this.clock || this.clock.ended) return
      this.log(change.transitionSec > 0 ? 'weather_transition' : 'weather_state', {
        meta: {
          from: change.from,
          to: change.to,
          is_day: change.isDay,
          transition_sec: change.transitionSec,
          source: change.source,
          ...change.detail,
        },
      })
    }
  }

  get conditions(): WeatherCondition[] {
    return this.config.condition_order ?? ['A', 'B']
  }

  /** Condition at a 1-based position (defaults to the current one). */
  conditionAt(position = this.position): WeatherCondition | null {
    return this.conditions[position - 1] ?? null
  }

  clipAt(position: number): ClipNumber {
    return this.config.clip_assignment?.[position - 1] ?? (position % 2 === 1 ? 1 : 2)
  }

  /** Video start time: only the third condition (reused clip) starts later. */
  clipOffsetAt(position: number): number {
    return position === 3 ? (this.config.clip3_offset_sec ?? WEATHER_CONFIG.clip3OffsetSec) : 0
  }

  /** Live link to the admin panel (safe to call more than once; never in a preview). */
  connect() {
    if (this.statusTimer || this.preview) return
    this.live = openParticipantChannel(this.id, this.handleCommand)
    this.statusTimer = window.setInterval(() => this.sendStatus(), 1000)
  }

  /** Start pressed: store hometown and family name on the session. */
  async begin(details: StartDetails) {
    this.personal = { familyName: details.familyName, hometown: details.hometown.name }
    const { lat, lon } = details.hometown
    this.hometownCoords = lat !== null && lon !== null ? { lat, lon } : null
    await this.logger.startWeatherSession({
      p_id: this.id,
      p_hometown_name: details.hometown.name,
      p_hometown_lat: lat,
      p_hometown_lon: lon,
      p_family_name: details.familyName,
    })
    this.log('consent', { round: 0, meta: { agreed: true, hometown_has_coords: this.hometownCoords !== null } })
    this.connect()
  }

  /** Log one event. Outside a condition, `round` is 0 and `condition` null. */
  log(
    type: WeatherEventType,
    extra: { round?: number; condition?: WeatherCondition | null; t_sec?: number | null; meta?: Record<string, unknown> } = {},
  ) {
    const round = extra.round ?? this.position
    const condition = extra.condition !== undefined ? extra.condition : round ? this.conditionAt(round) : null
    const t = extra.t_sec !== undefined ? extra.t_sec : this.clock && !this.clock.ended ? this.clock.t : null
    this.logger.event({
      session_id: this.id,
      round,
      form: 'plant',
      condition,
      type,
      t_sec: t === null ? null : Math.round(t * 1000) / 1000,
      meta: extra.meta ?? null,
    })
    if (!this.preview) this.live?.event({ round, type, t_sec: t ?? 0, health: 0 })
  }

  /**
   * Gets the starting weather for a condition: live from Open-Meteo for B
   * (hometown) and C (Amsterdam), the fallback state if that fails, the
   * `?weather=` state if given, null for A. Called on the framing screen;
   * the same promise is reused if called again.
   */
  prepareWeather(position: number): Promise<PreparedWeather | null> {
    let promise = this.preparing.get(position)
    if (!promise) {
      promise = this.fetchWeatherFor(this.conditionAt(position))
      this.preparing.set(position, promise)
    }
    return promise
  }

  private async fetchWeatherFor(condition: WeatherCondition | null): Promise<PreparedWeather | null> {
    if (condition !== 'B' && condition !== 'C') return null
    const amsterdam = WEATHER_CONFIG.amsterdam
    const place =
      condition === 'C'
        ? { name: amsterdam.name, lat: amsterdam.lat, lon: amsterdam.lon }
        : { name: this.personal.hometown ?? '', lat: this.hometownCoords?.lat ?? null, lon: this.hometownCoords?.lon ?? null }
    if (URL_PARAMS.weather) {
      return { state: URL_PARAMS.weather, isDay: true, source: 'url', place, data: null, error: null }
    }
    const fallback = (error: string): PreparedWeather => ({
      state: WEATHER_CONFIG.fallbackState,
      isDay: true,
      source: 'fallback',
      place,
      data: null,
      error,
    })
    if (place.lat === null || place.lon === null) return fallback('hometown has no coordinates')
    try {
      const data = await fetchCurrentWeather(place.lat, place.lon)
      return { state: stateForCode(data.code), isDay: data.isDay, source: 'live', place, data, error: null }
    } catch (error) {
      console.warn('Weather fetch failed; using the fallback state', error)
      return fallback(String((error as Error)?.message ?? error))
    }
  }

  /** `prepared` comes from `prepareWeather(position)` (null for A). */
  startCondition(position: number, onEnd: () => void, prepared: PreparedWeather | null, track: CueTrack) {
    this.track = track
    this.position = position
    this.clock?.stop()
    this.clock = new ConditionClock({
      durationSec: WEATHER_CONFIG.conditionSec,
      speed: SPEED,
      readTime: () => track.update((cue, elapsed) => this.log('presence_cue', {
        t_sec: elapsed,
        meta: { event: cue.event, x: cue.x ?? null, video_t: cue.t, clip: track.clip },
      })),
      onTick: (t) => this.runScript(t),
      onEnd: () => {
        track.video.pause()
        this.log('condition_end', { t_sec: this.clock!.t, meta: { source: this.skipped ? 'manual' : 'script' } })
        this.skipped = false
        this.logger.flushSoon()
        this.releaseWakeLock()
        onEnd()
      },
    })
    this.log('condition_start', {
      t_sec: 0,
      meta: {
        position,
        clip: track.clip,
        clip_offset_sec: track.offset,
        speed: SPEED,
      },
    })
    this.clock.start()
    this.setupWeather(position, prepared)
    void this.requestWakeLock()
  }

  /** A: no weather layer. B/C: the prepared state, then the scripted changes. */
  private setupWeather(position: number, prepared: PreparedWeather | null) {
    this.prepared = prepared
    this.script = null
    if (this.conditionAt(position) === 'A' || !prepared) {
      // disable() logs the change itself; if the layer was already off, log it here.
      if (this.weather.enabled) this.weather.disable('script')
      else this.log('weather_state', { meta: { from: null, to: null, source: 'script' } })
      return
    }
    const p = prepared
    if (p.error) this.log('weather_fetch_failed', { meta: { error: p.error, place: p.place.name, lat: p.place.lat, lon: p.place.lon } })

    // Scripted changes (not with ?weather=, which holds one state for tuning).
    if (p.source !== 'url') {
      const nearby = WEATHER_CONFIG.nearby[p.state]
      this.script = {
        real: p.state,
        nearby,
        changes: scheduleChanges(this.track?.cueTimes() ?? []).map((change, i) => ({
          ...change,
          to: i % 2 === 0 ? nearby : p.state,
          done: false,
        })),
      }
    }

    this.weather.show(p.state, p.isDay, p.source, {
      place: p.place.name,
      lat: p.place.lat,
      lon: p.place.lon,
      code: p.data?.code ?? null,
      temperature: p.data?.temperature ?? null,
      cloud_cover: p.data?.cloudCover ?? null,
      precipitation: p.data?.precipitation ?? null,
      local_time: p.data?.time ?? null,
      schedule: this.script?.changes.map((c) => ({ target: c.target, at: c.at, shift: c.shift, to: c.to, clear: c.clear })) ?? null,
    })
  }

  /** Fires the scripted changes as the condition clock passes them. */
  private runScript(t: number) {
    const script = this.script
    if (!script) return
    for (const change of script.changes) {
      if (change.done || t < change.at) continue
      change.done = true
      // Transition length is in condition seconds, so ?fast=1 speeds it up too.
      this.weather.transitionTo(change.to, 'script', WEATHER_CONFIG.transitionSec / SPEED, {
        planned_at: change.target,
        shift: change.shift,
      })
    }
  }

  submitAnswers(round: number, condition: WeatherCondition | null, values: Record<string, string>) {
    const rows: AnswerRow[] = Object.entries(values).map(([question_id, value]) => ({
      session_id: this.id,
      round,
      form: round ? 'plant' : null,
      condition,
      question_id,
      value,
    }))
    this.logger.answers(rows)
  }

  setPhase(phase: Phase) {
    this.phase = phase
    this.sendStatus()
  }

  dispose() {
    clearInterval(this.statusTimer)
    this.statusTimer = 0
    this.clock?.stop()
    this.track?.video.pause()
    this.live?.close()
    this.live = null
    this.logger.dispose()
    this.releaseWakeLock()
  }

  private skipped = false

  private handleCommand = (command: Command) => {
    // Only "skip" applies to this test (no pulses, withering or mic).
    if (command === 'skip' && this.phase === 'round' && this.clock && !this.clock.ended) {
      this.skipped = true
      this.clock.finish()
    }
  }

  private sendStatus() {
    const running = this.phase === 'round' && this.clock
    this.live?.status({
      phase: this.phase,
      round: this.position || null,
      form: 'plant',
      condition: this.conditionAt(),
      t: running ? Math.round(this.clock!.t) : null,
      health: null,
      pulse: null,
      listening: false,
      pending: this.logger.pending,
    })
  }

  /** Keep the screen awake during a condition with no input. */
  private async requestWakeLock() {
    try {
      this.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      // Not supported or denied: the researcher should disable sleep instead.
    }
  }

  private releaseWakeLock() {
    void this.wakeLock?.release().catch(() => {})
    this.wakeLock = null
  }
}
