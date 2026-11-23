/**
 * All round timings and state dynamics. Times are in round seconds
 * (with `?fast=1` a round second passes 10× faster in real time).
 */
export const ROUND_CONFIG = {
  durationSec: 300,
  pulsesAtSec: [60, 150, 240],
  witherAtSec: 180,
  witherDurationSec: 20,
  startHealth: 0.7,
  witherTarget: 0.15,
  healthFloor: 0.08, // dormant, never 0 (it never dies)
  decayPerSec: 0.0015, // slow passive decay
  talkGainPerSec: 0.04, // gradual, not instant
  pulseLingerSec: 40, // partner glow fades slowly
  minTalkSec: 0.3, // ignore blips
  reviveThreshold: 0.6, // "healthy again"
}

export type RoundConfig = typeof ROUND_CONFIG

/** Round length in whole minutes, for on-screen and script text. */
export const ROUND_MINUTES = Math.round(ROUND_CONFIG.durationSec / 60)

/** m:ss for round seconds. */
export function formatClock(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

/** Real-time (not sped up) presentation timings, in seconds. */
export const PRESENTATION = {
  fadeInSec: 2.5,
  fadeOutSec: 2.5,
}

/** Microphone detection settings. */
export const MIC_CONFIG = {
  /** Talk event keeps going through pauses shorter than this. */
  hangoverSec: 0.5,
  /** Calibration: how long to measure silence, then speech. */
  silenceSec: 4,
  speechSec: 5,
  /** Where the on/off thresholds sit between noise floor (0) and speech level (1). */
  onRatio: 0.45,
  offRatio: 0.3,
  /** Calibration counts as unreliable if speech is less than this many dB above silence. */
  minGapDb: 6,
  /** Voice loudness 1 = this many dB above their calibrated speech level (normal speech ≈ 0.6). */
  voiceHeadroomDb: 8,
}

/**
 * Weather test settings. Timings are in condition seconds (sped up by `?fast=1`).
 * Presence and weather visuals get their own sections in later steps.
 */
export const WEATHER_CONFIG = {
  conditionSec: 60,
  presence: {
    restHealth: 0.82,
    recording: 'movement_v1',
    floorDepthRadius: 2.1,
    entryOpenness: 0.25,
    petalSpringRate: 18,
    petalSpringDamping: 0.56,
    wakeSec: 3,
    fadeSec: 60,
    passSec: 4,
    blurPx: 30,
    contrast: 0.8,
    opacity: 0.48,
    textureWidth: 160,
  },
  /** Amsterdam, for condition C. */
  amsterdam: { name: 'Amsterdam', lat: 52.37, lon: 4.9 },

  /** Shown in B/C until live weather is fetched, and when fetching fails. */
  fallbackState: 'cloudy' as WeatherState,
  /** Seconds a change between weather states takes (condition seconds; faster with ?fast=1). */
  transitionSec: 3,

  /**
   * Scripted weather changes, same rhythm in every B/C condition: start in the
   * real state, go to a nearby state at the first time, back at the second.
   */
  transitionsAtSec: [18, 42],
  /** Each scripted change may move up to this far to stay clear of presence cues… */
  transitionMaxShiftSec: 5,
  /** …keeping at least this gap between a change (start to end) and any cue. */
  transitionCueGapSec: 2,
  /** Where the first scripted change goes, per real state. */
  nearby: { clear: 'cloudy', cloudy: 'rain', rain: 'cloudy', snow: 'cloudy', fog: 'cloudy' } as Record<WeatherState, WeatherState>,

  /** Open-Meteo forecast request; after this the fallback state is used. */
  fetchTimeoutSec: 6,
  /** WMO weather codes (Open-Meteo `weather_code`) per state. Unknown codes count as cloudy. */
  wmoStates: {
    clear: [0, 1],
    cloudy: [2, 3],
    fog: [45, 48, 95, 96, 99], // fog, and thunderstorm ("fog / storm")
    rain: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82],
    snow: [71, 73, 75, 77, 85, 86],
  } as Record<WeatherState, number[]>,

  /**
   * Weather look. Colour and texture only: never movement or posture of the plant.
   * Keep plant saturation ≥ 0.75 and brightness near 1: grey and dim is how the form
   * test shows an unhealthy plant, so stronger values would read as "wilting".
   * The room (background, haze, particles) carries most of the weather.
   * Per state: tint (colour mixed in by tintAmount, keeping brightness), saturation
   * (1 = unchanged), brightness multiplier, glowTint (how much the petal glow takes
   * the tint), background colour, and amounts 0–1 of shimmer / rain / snow particles,
   * haze (low contrast) and flicker (occasional brief brightening).
   */
  visuals: {
    petalColor: '#ffffff',
    petalDrop: 0.035,
    closedPetalCurl: 0.28,
    flowerCenterScale: 0.65,
    petalLightIntensity: 0.24,
    flowerCenterGlow: 3,
    snowFlowerCenterColor: '#78ceff',
    stormFlowerCenterColor: '#ffd84a',
    closedFlowerCenterLift: 0.04,
    leafCount: 3,
    stemRadiusScale: 1 / 3,
    day: {
      clearExposure: 1.45,
      clearSkyHighlight: '#8bdcff',
      backgrounds: {
        clear: '#19adff',
        cloudy: '#86a9c3',
        rain: '#6e879f',
        snow: '#a7b9cb',
        fog: '#566574',
      } satisfies Record<WeatherState, string>,
      environmentIntensity: 0.65,
      floor: '#ffffff',
      bloomThreshold: 0.75,
      petalLightIntensity: 0.32,
    },
    states: {
      clear: { tint: '#ffb45a', tintAmount: 0.3, saturation: 1.1, brightness: 1.05, glowTint: 0.15, background: '#1c130a', shimmer: 1, rain: 0, snow: 0, haze: 0, flicker: 0 },
      cloudy: { tint: '#a4adb8', tintAmount: 0.2, saturation: 1, brightness: 0.95, glowTint: 0.1, background: '#14171b', shimmer: 0, rain: 0, snow: 0, haze: 0.3, flicker: 0 },
      rain: { tint: '#5e90dc', tintAmount: 0.35, saturation: 0.9, brightness: 0.95, glowTint: 0.25, background: '#0a1324', shimmer: 0, rain: 1, snow: 0, haze: 0.15, flicker: 0 },
      snow: { tint: '#eef4ff', tintAmount: 0.35, saturation: 0.75, brightness: 1.05, glowTint: 0.2, background: '#171c25', shimmer: 0, rain: 0, snow: 1, haze: 0.1, flicker: 0 },
      fog: { tint: '#8f949d', tintAmount: 0.35, saturation: 0.75, brightness: 0.92, glowTint: 0.25, background: '#191b1f', shimmer: 0, rain: 0.8, snow: 0, haze: 0.75, flicker: 1 },
    } satisfies Record<WeatherState, WeatherVisual>,
    /** Night (is_day = 0): cooler tint, plant slightly dimmer, room much darker. */
    night: { tint: '#5468a8', tintAmount: 0.35, brightness: 0.85, background: 0.4, petalLightIntensity: 0.15 },
    particles: {
      /** Falling droplets. Speed in scene units per second. */
      rain: { count: 220, size: 0.06, speed: 2.4, color: '#a9c8ff', opacity: 0.55 },
      /** Slow drifting flakes with a gentle sparkle. */
      snow: { count: 160, size: 0.05, speed: 0.16, color: '#ffffff', opacity: 0.8 },
      /** Warm points that twinkle in place around the plant. */
      shimmer: { count: 70, size: 0.05, color: '#ffd28a', opacity: 0.7 },
    },
    /** Scene fog distances at haze 1 (haze 0 = the normal room). */
    haze: { fogNear: 1.5, fogFar: 6.5 },
    /** Occasional brief brightening (storm feel): random gap, flash length, exposure boost. */
    stormExposure: 0.82,
    dayStormExposure: 0.48,
    flicker: { minGapSec: 4, maxGapSec: 8, flashSec: 0.14, strength: 0.35 },
  },
}

export type WeatherState = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog'
export const WEATHER_STATES: WeatherState[] = ['clear', 'cloudy', 'rain', 'snow', 'fog']
export const WEATHER_LABELS: Record<WeatherState, string> = {
  clear: 'clear',
  cloudy: 'cloudy',
  rain: 'rain',
  snow: 'snow',
  fog: 'fog / storm',
}

export function isWeatherState(value: unknown): value is WeatherState {
  return WEATHER_STATES.includes(value as WeatherState)
}

export interface WeatherVisual {
  tint: string
  tintAmount: number
  saturation: number
  brightness: number
  glowTint: number
  background: string
  shimmer: number
  rain: number
  snow: number
  haze: number
  flicker: number
}

export type Form = 'plant' | 'orb'
export type Order = 'plant-orb' | 'orb-plant'

export function formsFor(order: Order): [Form, Form] {
  return order === 'plant-orb' ? ['plant', 'orb'] : ['orb', 'plant']
}

export function isOrder(value: unknown): value is Order {
  return value === 'plant-orb' || value === 'orb-plant'
}

// ─── Tests ────────────────────────────────────────────────────

/** Which study a session runs. Stored on `sessions.test_type`. */
export type TestType = 'form' | 'weather'

export function isTestType(value: unknown): value is TestType {
  return value === 'form' || value === 'weather'
}

/** Weather test conditions: A = presence only, B = + hometown weather, C = + Amsterdam weather. */
export type WeatherCondition = 'A' | 'B' | 'C'

/** Video clip number (1 → presence_1.mp4, 2 → presence_2.mp4). */
export type ClipNumber = 1 | 2

/** What the participant page needs to know about its session (from `get_session_config()`). */
export interface SessionConfig {
  test_type: TestType
  order_ab: Order | null
  /** Weather only, in the order shown, e.g. ['B', 'A', 'C']. */
  condition_order: WeatherCondition[] | null
  /** Weather only: clip per position, same length as `condition_order`. */
  clip_assignment: ClipNumber[] | null
  /** Weather only: where the reused clip starts in the third condition (video seconds). */
  clip3_offset_sec: number | null
  include_c: boolean
}

/** All condition orders, used to rotate through them (auto counterbalancing). */
export function allConditionOrders(includeC: boolean): WeatherCondition[][] {
  if (!includeC) {
    return [
      ['A', 'B'],
      ['B', 'A'],
    ]
  }
  return [
    ['A', 'B', 'C'],
    ['A', 'C', 'B'],
    ['B', 'A', 'C'],
    ['B', 'C', 'A'],
    ['C', 'A', 'B'],
    ['C', 'B', 'A'],
  ]
}

/** Each condition shows the same movement sequence from the beginning. */
export function clipsFor(conditionCount: number): ClipNumber[] {
  return Array<ClipNumber>(conditionCount).fill(1)
}

/** "B,A,C" ↔ ['B', 'A', 'C'] (how lists are stored in text columns). */
export const joinList = (list: readonly (string | number)[]) => list.join(',')

export function parseConditions(value: string | null | undefined): WeatherCondition[] | null {
  const list = value?.split(',').map((s) => s.trim())
  return list?.length && list.every((c) => c === 'A' || c === 'B' || c === 'C') ? (list as WeatherCondition[]) : null
}

export function parseClips(value: string | null | undefined): ClipNumber[] | null {
  const list = value?.split(',').map((s) => Number(s.trim()))
  return list?.length && list.every((c) => c === 1 || c === 2) ? (list as ClipNumber[]) : null
}

// ─── URL ──────────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search)

export const URL_PARAMS = {
  session: params.get('session'),
  /** Bare-link preview of a test without a session (`?test=weather`); nothing is saved for the weather test. */
  test: isTestType(params.get('test')) ? (params.get('test') as TestType) : null,
  presenceTest: params.get('test') === 'presence',
  /** `?test=intro`: only the Weather test intro (two linked plants), nothing saved. */
  introPreview: params.get('test') === 'intro',
  /** Weather preview only: condition order, e.g. `?conditions=B,A` (default A,B,C). */
  conditions: parseConditions(params.get('conditions')),
  /** Weather test: force a weather state in B/C (`?weather=rain`), for visual tuning. */
  weather: isWeatherState(params.get('weather')) ? (params.get('weather') as WeatherState) : null,
  /** `?lab=weather`: the plant with the weather debug panel, no session or flow. */
  lab: params.get('lab') === 'weather',
  order: isOrder(params.get('order')) ? (params.get('order') as Order) : null,
  code: params.get('code'),
  admin: params.get('admin') === '1',
  compare: params.get('compare') === '1',
  fast: params.get('fast') === '1',
  debug: params.get('debug') === '1',
}

/** Round seconds per real second. */
export const SPEED = URL_PARAMS.fast ? 10 : 1
