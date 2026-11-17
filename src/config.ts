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

export type Form = 'plant' | 'orb'
export type Order = 'plant-orb' | 'orb-plant'

export function formsFor(order: Order): [Form, Form] {
  return order === 'plant-orb' ? ['plant', 'orb'] : ['orb', 'plant']
}

export function isOrder(value: unknown): value is Order {
  return value === 'plant-orb' || value === 'orb-plant'
}

const params = new URLSearchParams(window.location.search)

export const URL_PARAMS = {
  session: params.get('session'),
  order: isOrder(params.get('order')) ? (params.get('order') as Order) : null,
  code: params.get('code'),
  admin: params.get('admin') === '1',
  compare: params.get('compare') === '1',
  fast: params.get('fast') === '1',
  debug: params.get('debug') === '1',
}

/** Round seconds per real second. */
export const SPEED = URL_PARAMS.fast ? 10 : 1
