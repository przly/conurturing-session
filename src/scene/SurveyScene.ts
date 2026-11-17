import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { GroundedSkybox } from 'three/examples/jsm/objects/GroundedSkybox.js'
import { createFlower, type Flower } from './flower'
import type { Reaction } from './reactions'

/** How quickly values ease toward their target (higher = snappier). */
const EASE_RATE = 5
const DEG = Math.PI / 180
const GROUND_Y = -0.3

/**
 * Environment: an HDRI (CC0, Poly Haven "meadow") that lights the flower
 * and is projected onto a ground so the flower stands in the scene.
 * Swap the file in `public/hdri/` and update the URL to use another one.
 */
const HDRI_URL = `${import.meta.env.BASE_URL}hdri/meadow_2k.hdr`
/** Turn the HDRI around the flower, in degrees, to choose what's behind it. */
const HDRI_ROTATION = 0
/** Height the HDRI was "shot" from, in scene units. Bigger = the world looks larger around the flower. */
const HDRI_HEIGHT = 15
/** Radius of the projected ground/sky dome. */
const HDRI_RADIUS = 120
/** Overall brightness of the scene. */
const EXPOSURE = 1

/**
 * Framework-free Three.js scene with a single object (a flower).
 * React only calls `setReaction`, `setReducedMotion` and `dispose`.
 */
export class SurveyScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500)
  private flower: Flower
  private skybox: GroundedSkybox | null = null
  private envMap: THREE.Texture | null = null
  private disposed = false
  private resizeObserver: ResizeObserver
  private frame = 0
  private lastTime = 0
  private elapsed = 0

  private container: HTMLElement
  private reducedMotion = false
  private target: Reaction | null = null
  private current = {
    color: new THREE.Color(),
    targetColor: new THREE.Color(),
    scale: 1,
    tiltX: 0,
    tiltZ: 0,
    lift: 0,
    bob: 0,
    spin: 0,
  }

  constructor(container: HTMLElement) {
    this.container = container
    // Throws if WebGL is unavailable; the React wrapper shows a text fallback.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = EXPOSURE
    this.renderer.domElement.setAttribute('aria-hidden', 'true')
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.camera.position.set(0, 2.0, 6)
    this.camera.lookAt(0, 1.15, 0)

    // Most light comes from the HDRI; a soft key light keeps the petals defined.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8dce4, 0.3))
    const key = new THREE.DirectionalLight(0xffffff, 0.8)
    key.position.set(3, 5, 4)
    this.scene.add(key)

    // The model loads async; redraw so a static (reduced-motion) frame picks it up.
    this.flower = createFlower(() => {
      if (this.target && !this.frame) this.draw()
    })
    this.flower.root.position.y = GROUND_Y
    this.scene.add(this.flower.root)

    this.loadEnvironment()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced
    if (this.target) this.applyTarget(this.target)
  }

  setReaction(reaction: Reaction) {
    const first = this.target === null
    this.target = reaction
    this.applyTarget(reaction, first)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.flower.dispose()
    this.skybox?.geometry.dispose()
    ;(this.skybox?.material as THREE.Material | undefined)?.dispose()
    this.envMap?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private loadEnvironment() {
    new HDRLoader().load(
      HDRI_URL,
      (texture) => {
        if (this.disposed) {
          texture.dispose()
          return
        }
        texture.mapping = THREE.EquirectangularReflectionMapping
        this.envMap = texture
        const rotation = HDRI_ROTATION * DEG

        // Lighting and reflections.
        this.scene.environment = texture
        this.scene.environmentRotation.y = rotation

        // Visible backdrop, with the bottom half projected onto a flat ground at the stem base.
        this.skybox = new GroundedSkybox(texture, HDRI_HEIGHT, HDRI_RADIUS)
        this.skybox.position.y = GROUND_Y + HDRI_HEIGHT - 0.01
        this.skybox.rotation.y = rotation
        this.scene.add(this.skybox)

        if (this.target && !this.frame) this.draw()
      },
      undefined,
      (error) => console.error('Could not load HDRI', error),
    )
  }

  private applyTarget(reaction: Reaction, snap = false) {
    this.current.targetColor.set(reaction.color)
    if (snap || this.reducedMotion) {
      // Non-animated path: jump to the final pose.
      this.current.color.copy(this.current.targetColor)
      this.current.scale = reaction.scale
      this.current.tiltX = reaction.tilt[0] * DEG
      this.current.tiltZ = reaction.tilt[1] * DEG
      this.current.lift = reaction.lift
      this.current.bob = reaction.bob
      this.current.spin = reaction.spin
    }
    if (this.reducedMotion) {
      // Static fallback: no loop, draw a single frame.
      cancelAnimationFrame(this.frame)
      this.frame = 0
      this.flower.head.rotation.y = 0.3
      this.draw()
    } else if (!this.frame) {
      this.lastTime = performance.now()
      this.loop()
    }
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.05)
    this.lastTime = now
    this.tick(dt)
    this.draw()
  }

  private tick(dt: number) {
    const t = this.target
    if (!t) return
    const k = 1 - Math.exp(-EASE_RATE * dt)
    const c = this.current
    c.color.lerp(c.targetColor, k)
    c.scale += (t.scale - c.scale) * k
    c.tiltX += (t.tilt[0] * DEG - c.tiltX) * k
    c.tiltZ += (t.tilt[1] * DEG - c.tiltZ) * k
    c.lift += (t.lift - c.lift) * k
    c.bob += (t.bob - c.bob) * k
    c.spin += (t.spin - c.spin) * k
    this.elapsed += dt
    // Spin turns the flower head around its own centre, so the face stays visible.
    this.flower.head.rotation.y += c.spin * dt
  }

  private draw() {
    const c = this.current
    const { root, petalMaterial } = this.flower
    petalMaterial.color.copy(c.color)
    root.scale.setScalar(c.scale)
    root.rotation.set(c.tiltX, 0, c.tiltZ)

    const bob = this.reducedMotion ? 0 : Math.sin(this.elapsed * 1.6) * c.bob
    const height = c.lift + bob
    root.position.y = GROUND_Y + height

    this.renderer.render(this.scene, this.camera)
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    // Pull the camera back on narrow canvases so the flower never clips.
    this.camera.position.z = w / h < 1.2 ? 7.5 : 6
    this.camera.updateProjectionMatrix()
    if (this.target) this.draw()
  }
}
