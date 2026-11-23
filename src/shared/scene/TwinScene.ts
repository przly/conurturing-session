import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { WEATHER_CONFIG, type Form } from '@/config'
import type { TwinState } from '@/shared/scene/state'
import { applyGlow, createBodyMaterial, createSharedMaterial, ExpressionDriver, type Expression } from './expression'
import { createOrb, createPlant, type TwinForm } from './forms'
import { softDiffusionShader } from './softDiffusion'
import { VideoBackdrop, type VideoBackdropOptions } from './VideoBackdrop'
import { WeatherLayer, type WeatherLook } from './weather'

export interface TwinSceneOptions {
  /** Weather test only: read every frame; null = no weather layer this frame. */
  getWeather?: () => WeatherLook | null
  backdrop?: VideoBackdropOptions
  petalColor?: string
  petalWidthScale?: number
  leafWidthScale?: number
  leafRotationOffset?: number
  floorDepthRadius?: number
  /** Extra floor in front of the stage, toward the camera (the back edge stays put). */
  floorFrontExtend?: number
}

/** Dim, neutral room so the glow reads clearly and nothing hints at nature. */
const BACKGROUND = '#0d0e11'
const ENVIRONMENT_INTENSITY = 0.35
const EXPOSURE = 1
const SUNLIGHT = new THREE.Color('#fff0d8')
const OVERCAST_LIGHT = new THREE.Color('#e3ebf4')
const MOONLIGHT = new THREE.Color('#a9c7ed')
const LIGHTNING_COLOR = new THREE.Color('#e5edff')
const SNOW_CENTER_COLOR = new THREE.Color(WEATHER_CONFIG.visuals.snowFlowerCenterColor)
const STORM_CENTER_COLOR = new THREE.Color(WEATHER_CONFIG.visuals.stormFlowerCenterColor)
/** Bloom applies to both forms identically (only bright pixels bloom). */
const BLOOM = { strength: 0.65, radius: 0.5, threshold: 0.3 }

function createPoolTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Framework-free Three.js scene showing one form (plant or orb),
 * driven every frame by `getState()`.
 */
export class TwinScene {
  /** Latest eased expression (read by the debug overlay). */
  expression: Expression | null = null
  /** Weather test only (null in the form test). */
  readonly weather: WeatherLayer | null = null

  private backdrop?: VideoBackdrop
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
  private material = createSharedMaterial()
  /** Non-glowing parts (plant stem and leaves). */
  private bodyMaterial = createBodyMaterial()
  private mattePetals?: THREE.MeshPhysicalMaterial
  private readonly petalColor: string
  private petalHighlightLimit = { value: 0.85 }
  private weatherLeaves?: THREE.MeshStandardMaterial
  private weatherSpotlight?: THREE.SpotLight
  private skyFill?: THREE.HemisphereLight
  private floorFogStrength = { value: 0.25 }
  private form: TwinForm
  private floorMaterial!: THREE.MeshStandardMaterial
  private baseMaterial!: THREE.MeshStandardMaterial
  private poolMaterial!: THREE.MeshBasicMaterial
  private driver = new ExpressionDriver()
  private disposables: { dispose: () => void }[] = []
  private resizeObserver: ResizeObserver
  private container: HTMLElement
  private getState: () => TwinState
  private getWeather: (() => WeatherLook | null) | null
  private frame = 0
  private lastTime = performance.now()

  constructor(container: HTMLElement, form: Form, getState: () => TwinState, options: TwinSceneOptions = {}) {
    this.petalColor = options.petalColor ?? WEATHER_CONFIG.visuals.petalColor
    this.container = container
    this.getState = getState
    this.getWeather = options.getWeather ?? null

    // Throws if WebGL is unavailable; the React wrapper shows a text fallback.
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.shadowMap.enabled = Boolean(this.getWeather)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = EXPOSURE
    this.renderer.domElement.setAttribute('aria-hidden', 'true')
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(BACKGROUND)
    this.scene.fog = new THREE.Fog(BACKGROUND, 5, 11)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    const envMap = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    pmrem.dispose()
    this.scene.environment = envMap
    this.scene.environmentIntensity = ENVIRONMENT_INTENSITY
    this.disposables.push(envMap, this.material, this.bodyMaterial)

    this.camera.position.set(0, 1.15, 4.3)
    this.camera.lookAt(0, 0.8, 0)

    if (options.backdrop) {
      this.backdrop = new VideoBackdrop(options.backdrop)
      this.camera.add(this.backdrop.mesh)
      this.scene.add(this.camera)
      this.disposables.push(this.backdrop)
    }
    this.addStage(options.floorDepthRadius, options.floorFrontExtend)

    if (form === 'plant' && this.getWeather) {
      const transmissionPixels = new Uint8Array(32 * 4)
      for (let i = 0; i < 32; i++) {
        const tip = Math.round(255 * THREE.MathUtils.smoothstep(i / 31, 0.48, 1))
        transmissionPixels.set([tip, 0, 0, 255], i * 4)
      }
      const transmissionMap = new THREE.DataTexture(transmissionPixels, 32, 1)
      transmissionMap.magFilter = THREE.LinearFilter
      transmissionMap.minFilter = THREE.LinearFilter
      transmissionMap.needsUpdate = true
      this.mattePetals = new THREE.MeshPhysicalMaterial({
        color: this.petalColor,
        envMap,
        envMapIntensity: WEATHER_CONFIG.visuals.petalLightIntensity,
        side: THREE.DoubleSide,
        roughness: 0.77,
        transmission: 0.18,
        transmissionMap,
        thickness: 0.03,
        ior: 1.36,
        sheen: 0.32,
        sheenColor: '#f7ecd8',
        sheenRoughness: 0.85,
      })
      this.mattePetals.onBeforeCompile = (shader) => {
        shader.uniforms.petalHighlightLimit = this.petalHighlightLimit
        shader.fragmentShader = 'uniform float petalHighlightLimit;\n' + shader.fragmentShader.replace(
          '#include <fog_fragment>',
          `#include <fog_fragment>
          float petalLuma = luminance(gl_FragColor.rgb);
          float shoulder = 0.75 * petalHighlightLimit;
          if (petalLuma > shoulder) {
            float span = petalHighlightLimit - shoulder;
            float highlight = shoulder + span * (1.0 - exp(-(petalLuma - shoulder) / span));
            gl_FragColor.rgb *= highlight / petalLuma;
          }`,
        )
      }
      this.weatherLeaves = this.bodyMaterial.clone()
      this.weatherLeaves.roughness = 0.53
      this.disposables.push(this.mattePetals, transmissionMap, this.weatherLeaves)
    }
    this.form = form === 'plant'
      ? createPlant(this.material, this.bodyMaterial, this.getWeather
        ? {
            mattePetals: this.mattePetals,
            weatherLeaves: this.weatherLeaves,
            leafRotationOffset: options.leafRotationOffset,
            leafWidthScale: options.leafWidthScale,
            leafCount: WEATHER_CONFIG.visuals.leafCount,
            stemRadiusScale: WEATHER_CONFIG.visuals.stemRadiusScale,
            closedCenterLift: WEATHER_CONFIG.visuals.closedFlowerCenterLift,
            centerScale: WEATHER_CONFIG.visuals.flowerCenterScale,
            petalWidthScale: options.petalWidthScale,
            petalDrop: WEATHER_CONFIG.visuals.petalDrop,
            closedPetalCurl: WEATHER_CONFIG.visuals.closedPetalCurl,
          }
        : undefined)
      : createOrb(this.material)
    this.scene.add(this.form.root)
    this.disposables.push(this.form)

    if (this.getWeather) {
      this.weather = new WeatherLayer(this.scene, this.scene.background as THREE.Color, this.scene.fog as THREE.Fog, this.floorMaterial.color)
      this.disposables.push(this.weather)
      this.weatherSpotlight = new THREE.SpotLight(0xffffff, 12, 0, 0.65, 0.9)
      this.skyFill = new THREE.HemisphereLight(0xe9f1ff, 0xb3a898, 0.3)
      this.weatherSpotlight.position.set(-0.45, 2.8, 0.6)
      this.weatherSpotlight.castShadow = true
      this.weatherSpotlight.shadow.mapSize.set(1024, 1024)
      this.weatherSpotlight.shadow.radius = 4
      this.weatherSpotlight.shadow.bias = -0.0003
      this.weatherSpotlight.shadow.normalBias = 0.002
      this.weatherSpotlight.shadow.camera.near = 0.2
      this.weatherSpotlight.shadow.camera.far = 10
      this.form.root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true
          object.receiveShadow = true
        }
      })
      this.scene.add(this.weatherSpotlight, this.weatherSpotlight.target, this.skyFill)
      this.disposables.push(this.weatherSpotlight, this.skyFill)
    }

    this.composer = new EffectComposer(this.renderer)
    // Canvas antialiasing does not apply when the scene renders into the composer.
    const samples = Math.min(4, this.renderer.capabilities.maxSamples)
    this.composer.renderTarget1.samples = samples
    this.composer.renderTarget2.samples = samples
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold)
    this.composer.addPass(this.bloom)
    if (this.getWeather) {
      const diffusion = new ShaderPass(softDiffusionShader)
      this.composer.addPass(diffusion)
      this.disposables.push(diffusion)
    }
    this.composer.addPass(new OutputPass())

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.loop()
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.disposables.forEach((d) => d.dispose())
    this.bloom.dispose()
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  /** Identical floor and base for both forms. */
  private addStage(floorDepthRadius = 12, floorFrontExtend = 0) {
    const floorGeometry = new THREE.CircleGeometry(12, 64)
    this.floorMaterial = new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.9 })
    if (this.getWeather) {
      // Light the white floor independently so it stays below the bloom threshold.
      this.floorMaterial.envMap = this.scene.environment
      this.floorMaterial.envMapIntensity = ENVIRONMENT_INTENSITY
      // Keep some haze on the floor without letting it take on the full sky color.
      this.floorMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.floorFogStrength = this.floorFogStrength
        shader.uniforms.floorHighlightLimit = this.petalHighlightLimit
        const floorFog = THREE.ShaderChunk.fog_fragment.replace(
          'fogColor, fogFactor',
          'fogColor, fogFactor * floorFogStrength',
        )
        shader.fragmentShader = 'uniform float floorFogStrength, floorHighlightLimit;\n' + shader.fragmentShader
        shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', floorFog + `
          float floorLuma = luminance(gl_FragColor.rgb);
          float knee = floorHighlightLimit * 0.65;
          if (floorLuma > knee) {
            float span = floorHighlightLimit - knee;
            gl_FragColor.rgb *= (knee + span * (1.0 - exp(-(floorLuma - knee) / span))) / floorLuma;
          }`)
      }
    }
    const floor = new THREE.Mesh(floorGeometry, this.floorMaterial)
    floor.scale.y = (floorDepthRadius + floorFrontExtend / 2) / floorGeometry.parameters.radius
    floor.position.z = floorFrontExtend / 2
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.08
    floor.receiveShadow = Boolean(this.getWeather)
    this.scene.add(floor)

    const baseGeometry = new THREE.CylinderGeometry(0.34, 0.38, 0.08, 48)
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: '#2a2b30',
      roughness: 0.6,
      emissive: '#ffbb52',
      emissiveIntensity: 0,
    })
    this.baseMaterial = baseMaterial
    const base = new THREE.Mesh(baseGeometry, baseMaterial)
    base.position.y = -0.04
    base.castShadow = Boolean(this.getWeather)
    base.receiveShadow = Boolean(this.getWeather)
    this.scene.add(base)

    // Soft glow cast on the floor, the same for both forms.
    const poolTexture = createPoolTexture()
    const poolGeometry = new THREE.PlaneGeometry(2.8, 2.8)
    this.poolMaterial = new THREE.MeshBasicMaterial({
      map: poolTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    const pool = new THREE.Mesh(poolGeometry, this.poolMaterial)
    pool.rotation.x = -Math.PI / 2
    pool.position.y = -0.075
    this.scene.add(pool)

    this.disposables.push(floorGeometry, this.floorMaterial, baseGeometry, baseMaterial, poolTexture, poolGeometry, this.poolMaterial)
  }

  private updateLighting(look: WeatherLook | null) {
    const key = this.weatherSpotlight
    const fill = this.skyFill
    if (!key || !fill) return
    const lerp = THREE.MathUtils.lerp
    if (!look) {
      key.position.set(-0.7, 2.9, 0.8)
      key.target.position.set(0, 0, 0)
      key.color.set(0xfffaf4)
      key.intensity = 10
      key.shadow.radius = 4
      fill.intensity = 0.3
      return
    }

    const sun = lerp(Number(look.from === 'clear'), Number(look.to === 'clear'), look.mix)
    const storm = this.weather?.current?.flicker ?? 0
    const flash = this.weather?.current?.lightning ?? 0
    const side = lerp(lerp(-0.55, -2.2, sun), -2.4, look.night)
    key.position.set(lerp(side, 2.1, storm), lerp(3.3, 2.4, look.night), lerp(1.2, 0.6, storm))
    key.target.position.set(0, 0.45, 0)
    key.color.copy(OVERCAST_LIGHT).lerp(SUNLIGHT, sun).lerp(MOONLIGHT, look.night).lerp(LIGHTNING_COLOR, flash)
    key.intensity = lerp(lerp(1.8, 9, sun), 0.8, look.night) + 15 * flash
    key.shadow.radius = lerp(lerp(7, 2.5, sun), 2, flash)
    const dayFill = lerp(lerp(0.85, 0.38, sun), 0.32, storm)
    fill.intensity = lerp(dayFill, 0.07, look.night)
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now
    const state = this.getState()
    const e = this.driver.update(state, dt)
    this.baseMaterial.emissiveIntensity = 1.5 * (state.flowerEmphasis ?? 0)
    this.expression = e
    applyGlow(this.material, this.bodyMaterial, this.poolMaterial, e)
    if (this.weather) {
      // Apply the weather visuals on top of the shared glow.
      const targets = { material: this.material, body: this.bodyMaterial, pool: this.poolMaterial, floor: this.floorMaterial, scene: this.scene }
      const look = this.getWeather!()
      this.floorFogStrength.value = look ? 0.25 : 1
      const exposure = this.weather.apply(look, targets, dt)
      this.bloom.enabled = look !== null
      this.updateLighting(look)
      this.weatherLeaves?.color.copy(this.bodyMaterial.color)
      if (!look) {
        this.material.emissiveIntensity = 0
        this.poolMaterial.opacity = 0
      }
      this.bloom.threshold = THREE.MathUtils.lerp(
        BLOOM.threshold,
        WEATHER_CONFIG.visuals.day.bloomThreshold,
        look ? 1 - look.night : 0,
      )
      if (this.mattePetals) {
        this.petalHighlightLimit.value = look ? this.bloom.threshold * 0.98 : 0.85
        const { day, night, petalLightIntensity } = WEATHER_CONFIG.visuals
        this.mattePetals.color.set(look ? this.petalColor : '#f4f0e7')
        this.mattePetals.envMapIntensity = look
          ? THREE.MathUtils.lerp(day.petalLightIntensity, night.petalLightIntensity, look.night)
          : petalLightIntensity
      }
      this.renderer.toneMappingExposure = EXPOSURE * exposure
    }
    if (this.mattePetals) {
      const openness = e.headOpenness ?? 1
      const snow = this.weather?.current?.snow ?? 0
      const storm = this.weather?.current?.flicker ?? 0
      const lightning = this.weather?.current?.lightning ?? 0
      this.material.color.lerp(SNOW_CENTER_COLOR, snow).lerp(STORM_CENTER_COLOR, storm)
      this.material.emissive.lerp(SNOW_CENTER_COLOR, snow).lerp(STORM_CENTER_COLOR, storm)
      this.poolMaterial.color.lerp(SNOW_CENTER_COLOR, snow)
      const stormGlow = THREE.MathUtils.lerp(1, 0.6, storm)
      this.material.emissiveIntensity *= WEATHER_CONFIG.visuals.flowerCenterGlow * openness * openness * stormGlow * (1 + 0.8 * lightning)
    }
    this.backdrop?.update(this.camera, this.container.clientWidth)
    this.form.update(e, this.weather?.current ?? undefined)
    this.composer.render()
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    this.weather?.resize(this.camera.aspect)
    // Keep the object the same size on narrow (portrait) screens.
    const fit = Math.max(1, 1.2 / this.camera.aspect)
    this.camera.position.set(0, 1.15, 4.3 * fit)
    // Keep the same distance haze when the camera is pulled back for a narrow view.
    if (this.weather) this.weather.fogShift = 4.3 * (fit - 1)
    this.camera.lookAt(0, 0.8, 0)
    this.camera.updateProjectionMatrix()
  }
}
