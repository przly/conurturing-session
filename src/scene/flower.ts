import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Flower: a procedural stem with a hibiscus head loaded from
 * `public/models/hibiscus.glb` (converted from the hibiscus FBX).
 * Origin is at the base of the stem, so scaling and leaning
 * happen from the ground up.
 *
 * The petal texture is greyscale, so the petal colour comes from
 * the reaction config (`color` in `reactions.ts`). The other parts
 * (sepals, stigma, style, receptacle) keep their own textures.
 */
const MODEL_URL = `${import.meta.env.BASE_URL}models/hibiscus.glb`
const STEM_HEIGHT = 1.55
const STEM_COLOR = '#5f8a4e'
/** Widest horizontal extent of the flower head, in scene units. */
const HEAD_SIZE = 1.6
/** Glow at the tip of the pistil (the stigma in the middle of the flower). */
const GLOW_COLOR = '#ffd27a'
/** How brightly the stigma itself glows. */
const GLOW_EMISSIVE = 2.5
/** Light cast onto the petals around it. */
const GLOW_LIGHT_INTENSITY = 1.2
const GLOW_LIGHT_DISTANCE = 1.5
/** Diameter of the soft halo around the tip, in scene units. */
const GLOW_HALO_SIZE = 0.45

/** Soft round gradient used for the halo sprite. */
function createHaloTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export interface Flower {
  /** Whole flower; lean and scale this. */
  root: THREE.Group
  /** Flower head; spin this around its own axis. */
  head: THREE.Group
  petalMaterial: THREE.MeshStandardMaterial
  dispose: () => void
}

/** `onLoad` fires once the hibiscus model is in the scene (use it to redraw a static frame). */
export function createFlower(onLoad?: () => void): Flower {
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []
  const track = <T extends THREE.BufferGeometry>(g: T) => (geometries.push(g), g)
  let disposed = false

  const root = new THREE.Group()

  // Stem: a gently curved tube.
  const stemMaterial = new THREE.MeshStandardMaterial({ color: STEM_COLOR, roughness: 0.7 })
  materials.push(stemMaterial)
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.06, STEM_HEIGHT * 0.35, 0),
    new THREE.Vector3(-0.04, STEM_HEIGHT * 0.7, 0.02),
    new THREE.Vector3(0, STEM_HEIGHT, 0),
  ])
  root.add(new THREE.Mesh(track(new THREE.TubeGeometry(stemCurve, 32, 0.045, 10)), stemMaterial))

  // Two leaves: flattened spheres angled up and out.
  const leafGeometry = track(new THREE.SphereGeometry(1, 20, 12))
  for (const [side, y] of [[1, 0.45], [-1, 0.8]] as const) {
    const leaf = new THREE.Mesh(leafGeometry, stemMaterial)
    leaf.scale.set(0.3, 0.05, 0.12)
    leaf.position.set(side * 0.26, y, 0)
    leaf.rotation.z = side * 0.55
    root.add(leaf)
  }

  // Head sits on top of the stem, tipped toward the camera so the face is visible.
  const headMount = new THREE.Group()
  headMount.position.y = STEM_HEIGHT
  headMount.rotation.x = 0.55
  root.add(headMount)

  const head = new THREE.Group()
  headMount.add(head)

  // Shared petal material: the reaction colour tints the greyscale petal texture.
  const petalMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide })
  materials.push(petalMaterial)

  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene
      let receptacleBox: THREE.Box3 | null = null
      let stigmaBox: THREE.Box3 | null = null

      model.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return
        geometries.push(obj.geometry)
        const mat = obj.material as THREE.MeshStandardMaterial
        if (mat.map) textures.push(mat.map)
        if (mat.name === 'Petal') {
          petalMaterial.map = mat.map
          petalMaterial.needsUpdate = true
          obj.material = petalMaterial
          mat.dispose()
        } else {
          mat.side = THREE.DoubleSide
          materials.push(mat)
        }
        if (mat.name === 'Receptacle') receptacleBox = new THREE.Box3().setFromObject(obj)
        if (mat.name === 'Stigma') {
          // Self-lit, so the tip reads as glowing whatever the scene light does.
          mat.emissive.set(GLOW_COLOR)
          mat.emissiveIntensity = GLOW_EMISSIVE
          stigmaBox = new THREE.Box3().setFromObject(obj)
        }
      })

      if (disposed) {
        cleanup()
        return
      }

      // Normalise: scale to HEAD_SIZE, centre on the receptacle, base at y = 0.
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const scale = HEAD_SIZE / Math.max(size.x, size.z)
      const centre = (receptacleBox ?? box).getCenter(new THREE.Vector3())
      model.scale.setScalar(scale)
      model.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale)

      // Light + halo at the stigma. Both live in model space, so they spin and scale with the head.
      const tip = (stigmaBox as THREE.Box3 | null)?.getCenter(new THREE.Vector3())
      if (tip) {
        const light = new THREE.PointLight(GLOW_COLOR, GLOW_LIGHT_INTENSITY, GLOW_LIGHT_DISTANCE, 2)
        light.position.copy(tip)
        model.add(light)

        const haloTexture = createHaloTexture()
        const haloMaterial = new THREE.SpriteMaterial({
          map: haloTexture,
          color: GLOW_COLOR,
          transparent: true,
          depthWrite: false,
        })
        textures.push(haloTexture)
        materials.push(haloMaterial)
        const halo = new THREE.Sprite(haloMaterial)
        halo.position.copy(tip)
        halo.scale.setScalar(GLOW_HALO_SIZE / scale)
        model.add(halo)
      }

      head.add(model)
      onLoad?.()
    },
    undefined,
    (error) => console.error('Could not load hibiscus model', error),
  )

  function cleanup() {
    geometries.forEach((g) => g.dispose())
    materials.forEach((m) => m.dispose())
    textures.forEach((t) => t.dispose())
  }

  return {
    root,
    head,
    petalMaterial,
    dispose: () => {
      disposed = true
      cleanup()
    },
  }
}
