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
const DAY_BACKGROUNDS = Object.fromEntries(
  Object.entries(V.day.backgrounds).map(([state, color]) => [state, new THREE.Color(color)]),
) as Record<WeatherState, THREE.Color>
const DAY_FLOOR = new THREE.Color(V.day.floor)
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
  floor: THREE.MeshStandardMaterial
  scene: THREE.Scene
}

export class WeatherLayer {
  private skyMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  /** Latest blended values (for the debug panel). */
  current: { haze: number; flicker: number; lightning: number; rain: number; snow: number; shimmer: number } | null = null

  private texture = createDotTexture()
  private rain: Particles
  private snow: Particles
  private shimmer: Particles
  private params = toParams(V.states.cloudy)
  private daylight = new THREE.Color()
  private baseFloor: THREE.Color
  private baseEnvironmentIntensity: number
  private baseFog: { near: number; far: number }
  private readonly fog: THREE.Fog
  /** Moves the fog away from the camera by this much, when the camera is pulled back. */
  fogShift = 0
  private time = 0
  private nextFlash = V.flicker.minGapSec
  private flashUntil = -1

  constructor(scene: THREE.Scene, background: THREE.Color, fog: THREE.Fog, floor: THREE.Color) {
    this.fog = fog
    this.skyMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          skyColor: { value: background },
          studio: { value: false },
          highlightColor: { value: new THREE.Color(V.day.clearSkyHighlight) },
          clearDaylight: { value: 0 },
          clearNight: { value: 0 },
          cloudAmount: { value: 0 },
          rainCloudShare: { value: 0 },
          cloudLight: { value: 0 },
          aspect: { value: 1 },
        },
        vertexShader: `
          varying vec2 skyUv;
          void main() {
            skyUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 skyUv;
          uniform vec3 skyColor;
          uniform bool studio;
          uniform vec3 highlightColor;
          uniform float clearDaylight;
          uniform float clearNight;
          uniform float cloudAmount;
          uniform float rainCloudShare;
          uniform float cloudLight;
          uniform float aspect;
          float cloudLayer(vec2 point, vec2 center, vec2 size) {
            return 1.0 - smoothstep(0.55, 1.0, length((point - center) / size));
          }

          float starHash(vec2 cell) {
            return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
          }

          // Smoothly join broad lobes into a single cloud silhouette.
          float joinBillows(float a, float b) {
            float blend = max(0.24 - abs(a - b), 0.0);
            return min(a, b) - blend * blend / 0.96;
          }

          float billowDistance(vec2 p, vec2 center, vec2 radii) {
            return length((p - center) / radii) - 1.0;
          }

          float starField(vec2 uv) {
            vec2 grid = uv * vec2(aspect, 1.0) * 24.0;
            vec2 cell = floor(grid);
            float seed = starHash(cell);
            vec2 center = vec2(starHash(cell + 19.0), starHash(cell + 43.0)) * 0.8 + 0.1;
            float distanceToStar = length(fract(grid) - center);
            float radius = mix(0.018, 0.039, seed);
            float edge = max(fwidth(grid.y), 0.001);
            float star = 1.0 - smoothstep(max(0.0, radius - edge), radius + edge, distanceToStar);
            return star * step(0.82, seed) * starHash(cell + 71.0) * smoothstep(0.55, 0.8, uv.y);
          }

          void main() {
            float top = smoothstep(0.55, 1.0, skyUv.y);
            if (studio) {
              gl_FragColor = vec4(skyColor * (1.0 - 0.17 * top), 1.0);
              return;
            }
            float radius = length(vec2(skyUv.x * aspect, 1.0 - skyUv.y));
            float highlight = (1.0 - smoothstep(0.0, 0.9, radius)) * clearDaylight;
            vec3 sky = mix(skyColor * (1.0 - 0.12 * top), highlightColor, highlight);
            sky += vec3(0.48, 0.57, 0.72) * starField(skyUv) * clearNight;

            if (cloudAmount <= 0.0) {
              gl_FragColor = vec4(sky, 1.0);
              return;
            }
            vec2 point = skyUv;
            float front = billowDistance(point, vec2(0.13, 0.844), vec2(0.255, 0.045));
            front = joinBillows(front, billowDistance(point, vec2(0.105, 0.857), vec2(0.093, 0.057)));
            front = joinBillows(front, billowDistance(point, vec2(0.209, 0.876), vec2(0.102, 0.070)));
            front = joinBillows(front, billowDistance(point, vec2(0.310, 0.853), vec2(0.091, 0.038)));
            float upperBank = 1.0 - smoothstep(-0.28, 0.20, front);
            float farBank = max(
              cloudLayer(point, vec2(0.76, 0.76), vec2(0.31, 0.043)),
              cloudLayer(point, vec2(0.91, 0.782), vec2(0.22, 0.055))
            );
            float wisps = cloudLayer(point, vec2(0.50, 0.81), vec2(0.38, 0.023));
            float high = billowDistance(point, vec2(0.69, 0.945), vec2(0.18, 0.034));
            high = joinBillows(high, billowDistance(point, vec2(0.63, 0.967), vec2(0.078, 0.046)));
            high = joinBillows(high, billowDistance(point, vec2(0.77, 0.958), vec2(0.072, 0.030)));
            float highBank = 1.0 - smoothstep(-0.25, 0.22, high);
            float lowBank = max(
              cloudLayer(point, vec2(0.21, 0.69), vec2(0.20, 0.030)),
              cloudLayer(point, vec2(0.28, 0.705), vec2(0.095, 0.035))
            );
            vec3 daytimeCloud = mix(vec3(0.64, 0.72, 0.79), vec3(0.25, 0.32, 0.40), rainCloudShare);
            vec3 nighttimeCloud = mix(skyColor + vec3(0.045, 0.057, 0.075), skyColor * 1.35, rainCloudShare);
            vec3 cloud = mix(nighttimeCloud, daytimeCloud, cloudLight);
            float upperLight = smoothstep(0.807, 0.919, point.y - 0.017 * point.x);
            vec3 frontColor = cloud * mix(0.64, 1.14, upperLight);
            vec3 distantSky = mix(sky, cloud, cloudAmount * (0.47 * farBank + 0.13 * wisps));
            distantSky = mix(distantSky, cloud, lowBank * cloudAmount * 0.42);
            float highLight = smoothstep(0.91, 0.99, point.y);
            distantSky = mix(distantSky, cloud * mix(0.78, 1.12, highLight), highBank * cloudAmount * 0.76);
            gl_FragColor = vec4(mix(distantSky, frontColor, upperBank * cloudAmount * 0.86), 1.0);
          }
        `,
      }),
    )
    this.skyMesh.frustumCulled = false
    this.skyMesh.renderOrder = -2
    scene.add(this.skyMesh)

    const p = V.particles
    this.rain = new Particles(p.rain.count, p.rain.size, p.rain.color, p.rain.opacity, this.texture, RAIN_VOLUME)
    this.snow = new Particles(p.snow.count, p.snow.size, p.snow.color, p.snow.opacity, this.texture, SNOW_VOLUME)
    this.shimmer = new Particles(p.shimmer.count, p.shimmer.size, p.shimmer.color, p.shimmer.opacity, this.texture, SHIMMER_VOLUME)
    scene.add(this.rain.points, this.snow.points, this.shimmer.points)
    this.baseFloor = floor.clone()
    this.baseEnvironmentIntensity = scene.environmentIntensity
    this.baseFog = { near: fog.near, far: fog.far }
  }

  /**
   * Call after the shared glow has been applied. Returns the exposure
   * multiplier for this frame (1 unless flickering).
   */
  apply(look: WeatherLook | null, t: WeatherTargets, dt: number): number {
    this.time += dt
    const fog = this.fog
    const background = t.scene.background as THREE.Color
    this.skyMesh.material.uniforms.studio.value = !look
    if (!look) {
      background.set('#f4f2ee')
      t.floor.color.copy(background)
      t.floor.emissive.copy(background)
      t.floor.emissiveIntensity = 0.46
      t.scene.environmentIntensity = this.baseEnvironmentIntensity
      fog.color.copy(background)
      fog.near = this.baseFog.near - 1 + this.fogShift
      fog.far = this.baseFog.far + this.fogShift
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
    this.daylight.copy(DAY_BACKGROUNDS[look.from]).lerp(DAY_BACKGROUNDS[look.to], look.mix)
    p.background.multiplyScalar(V.night.background).lerp(this.daylight, 1 - look.night)
    t.floor.color.copy(DAY_FLOOR).lerp(this.baseFloor, look.night)
    t.floor.emissiveIntensity = 0
    t.scene.environmentIntensity = THREE.MathUtils.lerp(V.day.environmentIntensity, this.baseEnvironmentIntensity, look.night)

    grade(t.material.color, p.tint, p.tintAmount, p.saturation, p.brightness)
    grade(t.body.color, p.tint, p.tintAmount, p.saturation, p.brightness)
    grade(t.material.emissive, p.tint, p.glowTint, Math.min(1, p.saturation), 1)
    grade(t.pool.color, p.tint, p.glowTint, Math.min(1, p.saturation), p.brightness)

    background.copy(p.background)
    fog.color.copy(p.background)
    fog.near = THREE.MathUtils.lerp(this.baseFog.near, V.haze.fogNear, p.haze) + this.fogShift
    fog.far = THREE.MathUtils.lerp(this.baseFog.far, V.haze.fogFar, p.haze) + this.fogShift

    this.updateParticles(p, dt)
    const lightning = this.flicker(p.flicker)
    this.current = { haze: p.haze, flicker: p.flicker, lightning, rain: p.rain, snow: p.snow, shimmer: p.shimmer }
    const clearAmount = THREE.MathUtils.lerp(
      look.from === 'clear' ? 1 : 0,
      look.to === 'clear' ? 1 : 0,
      look.mix,
    )
    const clearDaylight = clearAmount * (1 - look.night)
    const clearNight = clearAmount * look.night
    const cloudyAmount = THREE.MathUtils.lerp(
      look.from === 'cloudy' ? 1 : 0,
      look.to === 'cloudy' ? 1 : 0,
      look.mix,
    )
    const rainAmount = THREE.MathUtils.lerp(
      look.from === 'rain' ? 1 : 0,
      look.to === 'rain' ? 1 : 0,
      look.mix,
    )
    const cloudAmount = cloudyAmount + rainAmount
    this.skyMesh.material.uniforms.clearDaylight.value = clearDaylight
    this.skyMesh.material.uniforms.clearNight.value = clearNight
    this.skyMesh.material.uniforms.cloudAmount.value = cloudAmount
    this.skyMesh.material.uniforms.rainCloudShare.value = cloudAmount > 0 ? rainAmount / cloudAmount : 0
    this.skyMesh.material.uniforms.cloudLight.value = 1 - look.night
    const exposure = THREE.MathUtils.lerp(1, V.day.clearExposure, clearDaylight)
    const stormExposure = THREE.MathUtils.lerp(V.dayStormExposure, V.stormExposure, look.night)
    return exposure * THREE.MathUtils.lerp(1, stormExposure, p.flicker) * (1 + V.flicker.strength * lightning)
  }

  resize(aspect: number) {
    this.skyMesh.material.uniforms.aspect.value = aspect
  }

  dispose() {
    this.skyMesh.removeFromParent()
    this.skyMesh.geometry.dispose()
    this.skyMesh.material.dispose()
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

  /** Occasional short double flash, scaled by `amount`. */
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
    return amount * pulse
  }
}
