import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Form } from '@/config'
import type { TwinState } from '@/twin/RoundRunner'
import { applyGlow, createBodyMaterial, createSharedMaterial, ExpressionDriver, type Expression } from './expression'
import { createOrb, createPlant, type TwinForm } from './forms'

/** Dim, neutral room so the glow reads clearly and nothing hints at nature. */
const BACKGROUND = '#0d0e11'
const ENVIRONMENT_INTENSITY = 0.35
const EXPOSURE = 1
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

  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
  private material = createSharedMaterial()
  /** Non-glowing parts (plant stem and leaves). */
  private bodyMaterial = createBodyMaterial()
  private form: TwinForm
  private poolMaterial!: THREE.MeshBasicMaterial
  private driver = new ExpressionDriver()
  private disposables: { dispose: () => void }[] = []
  private resizeObserver: ResizeObserver
  private container: HTMLElement
  private getState: () => TwinState
  private frame = 0
  private lastTime = performance.now()

  constructor(container: HTMLElement, form: Form, getState: () => TwinState) {
    this.container = container
    this.getState = getState

    // Throws if WebGL is unavailable; the React wrapper shows a text fallback.
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
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

    this.addStage()

    this.form = form === 'plant' ? createPlant(this.material, this.bodyMaterial) : createOrb(this.material)
    this.scene.add(this.form.root)
    this.disposables.push(this.form)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold)
    this.composer.addPass(this.bloom)
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
  private addStage() {
    const floorGeometry = new THREE.CircleGeometry(12, 64)
    const floorMaterial = new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.9 })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.08
    this.scene.add(floor)

    const baseGeometry = new THREE.CylinderGeometry(0.34, 0.38, 0.08, 48)
    const baseMaterial = new THREE.MeshStandardMaterial({ color: '#2a2b30', roughness: 0.6 })
    const base = new THREE.Mesh(baseGeometry, baseMaterial)
    base.position.y = -0.04
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

    this.disposables.push(floorGeometry, floorMaterial, baseGeometry, baseMaterial, poolTexture, poolGeometry, this.poolMaterial)
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now
    const e = this.driver.update(this.getState(), dt)
    this.expression = e
    applyGlow(this.material, this.bodyMaterial, this.poolMaterial, e)
    this.form.update(e)
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
    // Keep the object the same size on narrow (portrait) screens.
    const fit = Math.max(1, 1.2 / this.camera.aspect)
    this.camera.position.set(0, 1.15, 4.3 * fit)
    this.camera.lookAt(0, 0.8, 0)
    this.camera.updateProjectionMatrix()
  }
}
