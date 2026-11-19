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
  conditionSec: 300,
  /** Amsterdam, for condition C. */
  amsterdam: { name: 'Amsterdam', lat: 52.37, lon: 4.9 },
  /** Where clip 1 starts when it is reused for a third condition (video seconds). */
  clip3OffsetSec: 150,
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

/** Clips alternate across sessions; a third condition reuses clip 1 (from an offset). */
export function clipsFor(alternate: boolean, conditionCount: number): ClipNumber[] {
  const clips: ClipNumber[] = alternate ? [2, 1] : [1, 2]
  return conditionCount === 3 ? [...clips, 1] : clips
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
  /** Weather preview only: condition order, e.g. `?conditions=B,A` (default A,B,C). */
  conditions: parseConditions(params.get('conditions')),
  order: isOrder(params.get('order')) ? (params.get('order') as Order) : null,
  code: params.get('code'),
  admin: params.get('admin') === '1',
  compare: params.get('compare') === '1',
  fast: params.get('fast') === '1',
  debug: params.get('debug') === '1',
}

/** Round seconds per real second. */
export const SPEED = URL_PARAMS.fast ? 10 : 1
