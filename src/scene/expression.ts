import * as THREE from 'three'
import { ROUND_CONFIG } from '@/config'
import type { TwinState } from '@/twin/RoundRunner'

/**
 * ─────────────────────────────────────────────────────────────
 *  SHARED LOOK: everything both forms have in common
 * ─────────────────────────────────────────────────────────────
 *  Plant and orb never read `health` / `pulse` / `listening`
 *  directly. They read the `Expression` below, which is computed
 *  once with the same easing, then use the same material and
 *  glow light. Only the shape and how it moves differ.
 */
export const LOOK = {
  /** Glow colour (light + emissive) for both forms. */
  glowColor: '#ffbe6a',
  /** Base surface colour for both forms. */
  surfaceColor: '#d6dccb',
  /** Emissive intensity at openness 0 / 1, plus extra at full pulse and while listening. */
  emissiveMin: 0.05,
  emissiveMax: 0.75,
  emissivePulse: 0.6,
  emissiveListening: 0.08,
  /** Glow pool on the floor (opacity) at openness 0 / 1, plus extra at full pulse. */
  poolMin: 0.02,
  poolMax: 0.24,
  poolPulse: 0.3,
  /** Surface brightness multiplier at openness 0 (dim). */
  dimSurface: 0.22,
  /** Colour saturation at openness 0 (desaturated). */
  saturationMin: 0.15,
  /** Idle breathing, Hz (same for both). Amplitude scales with openness down to this fraction. */
  idleHz: 0.22,
  idleMinAmount: 0.4,
  /** Partner pulse motion frequency, Hz, and peak displacement in scene units (same for both). */
  pulseHz: 0.45,
  pulseAmplitude: 0.12,
  /** Lean toward the camera while listening, in scene units of displacement at the top. */
  leanAmount: 0.22,
  /** Easing rates (per second; higher = faster). */
  opennessRate: 1.0,
  pulseRate: 3,
  leanRate: 2.5,
}

export interface Expression {
  /** 0 = withered/dormant, 1 = fully healthy. Eased. */
  openness: number
  /** 0–1, eased partner pulse. */
  pulse: number
  /** 0–1, eased listening. */
  lean: number
  /** −1…1 idle breathing wave, already scaled by openness. */
  idle: number
  /** −1…1 pulse motion wave, already scaled by `pulse`. */
  pulseWave: number
  /** Seconds since the scene started (for per-part phase offsets). */
  time: number
}

/** Health → openness, so both forms use the same normalised range. */
export function healthToOpenness(health: number) {
  const floor = ROUND_CONFIG.healthFloor
  return THREE.MathUtils.clamp((health - floor) / (1 - floor), 0, 1)
}

export class ExpressionDriver {
  readonly value: Expression = { openness: 0, pulse: 0, lean: 0, idle: 0, pulseWave: 0, time: 0 }
  private first = true

  update(state: TwinState, dt: number) {
    const v = this.value
    const target = healthToOpenness(state.health)
    if (this.first) {
      v.openness = target
      this.first = false
    }
    const ease = (from: number, to: number, rate: number) => from + (to - from) * (1 - Math.exp(-rate * dt))
    v.openness = ease(v.openness, target, LOOK.opennessRate)
    v.pulse = ease(v.pulse, state.pulse, LOOK.pulseRate)
    v.lean = ease(v.lean, state.listening ? 1 : 0, LOOK.leanRate)
    v.time += dt
    const idleAmount = LOOK.idleMinAmount + (1 - LOOK.idleMinAmount) * v.openness
    v.idle = Math.sin(v.time * Math.PI * 2 * LOOK.idleHz) * idleAmount
    v.pulseWave = Math.sin(v.time * Math.PI * 2 * LOOK.pulseHz) * v.pulse
    return v
  }
}

/** The one material both forms are made of. */
export function createSharedMaterial() {
  return new THREE.MeshStandardMaterial({
    color: LOOK.surfaceColor,
    roughness: 0.9,
    metalness: 0,
    emissive: LOOK.glowColor,
    side: THREE.DoubleSide,
  })
}

const baseSurface = new THREE.Color(LOOK.surfaceColor)
const baseGlow = new THREE.Color(LOOK.glowColor)
const scratch = new THREE.Color()

function desaturate(source: THREE.Color, saturation: number, out: THREE.Color) {
  const grey = source.r * 0.2126 + source.g * 0.7152 + source.b * 0.0722
  out.setRGB(grey, grey, grey).lerp(source, saturation)
  return out
}

/**
 * Applies the expression to the shared material and the floor glow pool (identical for both forms).
 * Neither form has its own light: a light inside the plant's bud would light its leaves,
 * while one inside the orb can't light its own surface, which would make the test unfair.
 */
export function applyGlow(material: THREE.MeshStandardMaterial, pool: THREE.MeshBasicMaterial, e: Expression) {
  const o = e.openness
  const saturation = LOOK.saturationMin + (1 - LOOK.saturationMin) * o
  const dim = LOOK.dimSurface + (1 - LOOK.dimSurface) * o

  desaturate(baseSurface, saturation, scratch)
  material.color.copy(scratch).multiplyScalar(dim)
  desaturate(baseGlow, saturation, material.emissive)
  material.emissiveIntensity =
    LOOK.emissiveMin + (LOOK.emissiveMax - LOOK.emissiveMin) * o + LOOK.emissivePulse * e.pulse + LOOK.emissiveListening * e.lean

  desaturate(baseGlow, saturation, pool.color)
  pool.opacity = LOOK.poolMin + (LOOK.poolMax - LOOK.poolMin) * o + LOOK.poolPulse * e.pulse
}

export const lerp = THREE.MathUtils.lerp
