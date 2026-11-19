import * as THREE from 'three'
import { WEATHER_CONFIG, type WeatherState, type WeatherVisual } from '@/config'

/**
 * ─────────────────────────────────────────────────────────────
 *  WEATHER LAYER (weather test only)
 * ─────────────────────────────────────────────────────────────
 *  Changes colour and texture only: tints and saturation of the
 *  plant's materials, background, haze, flicker and particles
 *  around the plant. It never moves or poses the plant. The form
 *  test never creates it, so its scene is untouched.
 */

/** What to show this frame: a blend between two states plus how much it is night. */
export interface WeatherLook {
  from: WeatherState
  to: WeatherState
  /** 0 = `from`, 1 = `to`. */
  mix: number
  /** 0 = day, 1 = night. */
  night: number
}

const V = WEATHER_CONFIG.visuals

interface Params {
  tint: THREE.Color
  tintAmount: number
  saturation: number
  brightness: number
  glowTint: number
  background: THREE.Color
  shimmer: number
  rain: number
  snow: number
  haze: number
  flicker: number
}

const toParams = (v: WeatherVisual): Params => ({ ...v, tint: new THREE.Color(v.tint), background: new THREE.Color(v.background) })
const STATE_PARAMS = Object.fromEntries(
  Object.entries(V.states).map(([k, v]) => [k, toParams(v)]),
) as Record<WeatherState, Params>
const NIGHT_TINT = new THREE.Color(V.night.tint)

function blendParams(a: Params, b: Params, t: number, out: Params) {
  const l = THREE.MathUtils.lerp
  out.tint.copy(a.tint).lerp(b.tint, t)
  out.background.copy(a.background).lerp(b.background, t)
  for (const key of ['tintAmount', 'saturation', 'brightness', 'glowTint', 'shimmer', 'rain', 'snow', 'haze', 'flicker'] as const) {
    out[key] = l(a[key], b[key], t)
  }
  return out
}

const luma = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
const scratch = new THREE.Color()

/** Mix `tint` into `color` keeping its brightness, then set saturation and brightness. */
function grade(color: THREE.Color, tint: THREE.Color, amount: number, saturation: number, brightness: number) {
  const l = luma(color)
  const tl = Math.max(luma(tint), 1e-4)
  scratch.copy(tint).multiplyScalar(l / tl)
  color.lerp(scratch, amount)
  const grey = luma(color)
  color.setRGB(
    Math.max(0, grey + (color.r - grey) * saturation),
    Math.max(0, grey + (color.g - grey) * saturation),
    Math.max(0, grey + (color.b - grey) * saturation),
  )
  color.multiplyScalar(brightness)
}

function createDotTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A cloud of points around the plant. */
class Particles {
  readonly points: THREE.Points
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly phase: Float32Array
  private geometry = new THREE.BufferGeometry()
  private material: THREE.PointsMaterial
  private baseOpacity: number

  constructor(count: number, size: number, color: string, opacity: number, texture: THREE.Texture, volume: { r: number; y0: number; y1: number }) {
    this.positions = new Float32Array(count * 3)
    this.colors = new Float32Array(count * 3).fill(1)
    this.phase = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // Even spread in a disc around the plant (sqrt for uniform area).
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * volume.r
      this.positions[i * 3] = Math.cos(a) * r
      this.positions[i * 3 + 1] = volume.y0 + Math.random() * (volume.y1 - volume.y0)
      this.positions[i * 3 + 2] = Math.sin(a) * r
      this.phase[i] = Math.random() * Math.PI * 2
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    this.baseOpacity = opacity
    this.material = new THREE.PointsMaterial({
      size,
      map: texture,
      color,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.visible = false
  }

  setAmount(amount: number) {
    this.material.opacity = this.baseOpacity * amount
    this.points.visible = amount > 0.005
  }

  markDirty(colors = false) {
    this.geometry.attributes.position.needsUpdate = true
    if (colors) this.geometry.attributes.color.needsUpdate = true
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}

const RAIN_VOLUME = { r: 1.5, y0: 0, y1: 2.6 }
const SNOW_VOLUME = { r: 1.6, y0: 0, y1: 2.6 }
const SHIMMER_VOLUME = { r: 0.95, y0: 0.4, y1: 1.9 }

export interface WeatherTargets {
  material: THREE.MeshStandardMaterial
  body: THREE.MeshStandardMaterial
  pool: THREE.MeshBasicMaterial
  scene: THREE.Scene
}

export class WeatherLayer {
  /** Latest blended values (for the debug panel). */
  current: { haze: number; flicker: number; rain: number; snow: number; shimmer: number } | null = null

  private texture = createDotTexture()
  private rain: Particles
  private snow: Particles
  private shimmer: Particles
  private params = toParams(V.states.cloudy)
  private baseBackground: THREE.Color
  private baseFog: { near: number; far: number }
  private time = 0
  private nextFlash = 5
  private flashUntil = -1

  constructor(scene: THREE.Scene, background: THREE.Color, fog: THREE.Fog) {
    const p = V.particles
    this.rain = new Particles(p.rain.count, p.rain.size, p.rain.color, p.rain.opacity, this.texture, RAIN_VOLUME)
    this.snow = new Particles(p.snow.count, p.snow.size, p.snow.color, p.snow.opacity, this.texture, SNOW_VOLUME)
    this.shimmer = new Particles(p.shimmer.count, p.shimmer.size, p.shimmer.color, p.shimmer.opacity, this.texture, SHIMMER_VOLUME)
    scene.add(this.rain.points, this.snow.points, this.shimmer.points)
    this.baseBackground = background.clone()
    this.baseFog = { near: fog.near, far: fog.far }
  }

  /**
   * Call after the shared glow has been applied. Returns the exposure
   * multiplier for this frame (1 unless flickering).
   */
  apply(look: WeatherLook | null, t: WeatherTargets, dt: number): number {
    this.time += dt
    const fog = t.scene.fog as THREE.Fog
    const background = t.scene.background as THREE.Color
    if (!look) {
      background.copy(this.baseBackground)
      fog.color.copy(this.baseBackground)
      fog.near = this.baseFog.near
      fog.far = this.baseFog.far
      this.rain.setAmount(0)
      this.snow.setAmount(0)
      this.shimmer.setAmount(0)
      this.current = null
      return 1
    }

    const p = blendParams(STATE_PARAMS[look.from], STATE_PARAMS[look.to], look.mix, this.params)
    // Night: cooler and dimmer on top of the state.
    p.tint.lerp(NIGHT_TINT, look.night * V.night.tintAmount)
    p.brightness *= THREE.MathUtils.lerp(1, V.night.brightness, look.night)
    p.background.multiplyScalar(THREE.MathUtils.lerp(1, V.night.background, look.night))

    grade(t.material.color, p.tint, p.tintAmount, p.saturation, p.brightness)
    grade(t.body.color, p.tint, p.tintAmount, p.saturation, p.brightness)
    grade(t.material.emissive, p.tint, p.glowTint, Math.min(1, p.saturation), 1)
    grade(t.pool.color, p.tint, p.glowTint, Math.min(1, p.saturation), p.brightness)

    background.copy(p.background)
    fog.color.copy(p.background)
    fog.near = THREE.MathUtils.lerp(this.baseFog.near, V.haze.fogNear, p.haze)
    fog.far = THREE.MathUtils.lerp(this.baseFog.far, V.haze.fogFar, p.haze)

    this.updateParticles(p, dt)
    this.current = { haze: p.haze, flicker: p.flicker, rain: p.rain, snow: p.snow, shimmer: p.shimmer }
    return 1 + this.flicker(p.flicker)
  }

  dispose() {
    this.rain.dispose()
    this.snow.dispose()
    this.shimmer.dispose()
    this.texture.dispose()
  }

  private updateParticles(p: Params, dt: number) {
    const P = V.particles
    this.rain.setAmount(p.rain)
    if (this.rain.points.visible) {
      const pos = this.rain.positions
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] -= P.rain.speed * dt
        if (pos[i] < RAIN_VOLUME.y0) pos[i] += RAIN_VOLUME.y1 - RAIN_VOLUME.y0
      }
      this.rain.markDirty()
    }

    this.snow.setAmount(p.snow)
    if (this.snow.points.visible) {
      const pos = this.snow.positions
      const col = this.snow.colors
      for (let i = 0; i < this.snow.phase.length; i++) {
        const ph = this.snow.phase[i]
        pos[i * 3 + 1] -= P.snow.speed * dt
        pos[i * 3] += Math.sin(this.time * 0.5 + ph) * 0.05 * dt
        if (pos[i * 3 + 1] < SNOW_VOLUME.y0) pos[i * 3 + 1] += SNOW_VOLUME.y1 - SNOW_VOLUME.y0
        const sparkle = 0.6 + 0.4 * Math.max(0, Math.sin(this.time * 1.3 + ph * 3))
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = sparkle
      }
      this.snow.markDirty(true)
    }

    this.shimmer.setAmount(p.shimmer)
    if (this.shimmer.points.visible) {
      const col = this.shimmer.colors
      for (let i = 0; i < this.shimmer.phase.length; i++) {
        const twinkle = Math.max(0, Math.sin(this.time * 0.9 + this.shimmer.phase[i] * 5)) ** 3
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = twinkle
      }
      this.shimmer.markDirty(true)
    }
  }

  /** Occasional short double flash, scaled by `amount`. Returns extra exposure. */
  private flicker(amount: number): number {
    const F = V.flicker
    if (amount <= 0.01) return 0
    if (this.time >= this.nextFlash) {
      this.flashUntil = this.time + F.flashSec * 2.5
      this.nextFlash = this.time + F.minGapSec + Math.random() * (F.maxGapSec - F.minGapSec)
    }
    if (this.time > this.flashUntil) return 0
    // Two quick pulses within the flash window.
    const local = (this.flashUntil - this.time) / F.flashSec
    const pulse = local > 1.5 || local < 1 ? Math.max(0, Math.sin(local * Math.PI)) : 0
    return F.strength * amount * pulse
  }
}
