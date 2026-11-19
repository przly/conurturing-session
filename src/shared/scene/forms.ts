import * as THREE from 'three'
import { LOOK, lerp, type Expression } from './expression'

/**
 * The two forms. Both:
 *  - use the shared glowing material (driven in `applyGlow`); on the plant
 *    only the petals glow, the stem and leaves use a non-glowing material
 *  - map `openness` to their pose with the same easing (already in `Expression`)
 *  - breathe with `idle`, move with `pulseWave` (same peak displacement),
 *    and lean toward the camera with `lean` (same displacement at the top)
 *  - react to voice loudness (`voice`): leaves swing toward perpendicular to
 *    the stem, the orb swells; both by a similar visible amount
 *
 * Origin is the top of the shared base, at y = 0.
 */
export interface TwinForm {
  root: THREE.Group
  update: (e: Expression) => void
  dispose: () => void
}

const DEG = Math.PI / 180

// ─── Orb ──────────────────────────────────────────────────────

const ORB = {
  radius: 0.4,
  /** Centre height when withered / healthy. */
  lowY: 0.5,
  highY: 1.05,
  /** Size when withered (healthy = 1). */
  minScale: 0.8,
  idleY: 0.03,
  idleScale: 0.015,
  /** Extra size at full voice loudness. */
  voiceScale: 0.14,
}

export function createOrb(material: THREE.Material): TwinForm {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const geometry = new THREE.SphereGeometry(ORB.radius, 64, 48)
  body.add(new THREE.Mesh(geometry, material))

  return {
    root,
    update(e) {
      const o = e.openness
      const y = lerp(ORB.lowY, ORB.highY, o) + e.idle * ORB.idleY + e.pulseWave * LOOK.pulseAmplitude
      body.position.set(0, y, e.lean * LOOK.leanAmount)
      body.scale.setScalar(lerp(ORB.minScale, 1, o) * (1 + e.idle * ORB.idleScale + e.voice * ORB.voiceScale))
    },
    dispose: () => geometry.dispose(),
  }
}

// ─── Plant ────────────────────────────────────────────────────

const PLANT = {
  stemRadius: 0.032,
  /** Stem segment lengths, bottom to top. */
  segments: [0.5, 0.42, 0.36],
  /** How far each stem joint bends sideways when withered / healthy (degrees). */
  droopDeg: 9,
  healthyBendDeg: 1,
  /** Leaves: [segment index, height on that segment, length]. */
  leaves: [
    [0, 0.26, 0.66],
    [0, 0.44, 0.62],
    [1, 0.16, 0.56],
    [1, 0.34, 0.52],
    [2, 0.12, 0.44],
    [2, 0.26, 0.38],
  ] as const,
  /** Leaf elevation: raised when healthy, hanging when withered (degrees). */
  leafOpenDeg: 45,
  leafDroopDeg: -58,
  /** Leaf width when withered (closed) vs healthy. */
  leafClosedWidth: 0.5,
  leafIdleDeg: 3,
  /** How far toward perpendicular the leaves go at full voice loudness (1 = fully perpendicular). */
  leafVoiceAmount: 1,
  /** Flower head: petal count and length; the head tips toward the camera so the face shows. */
  petals: 6,
  petalLength: 0.3,
  headTiltDeg: 35,
  /** Petal angle above horizontal: open (healthy) vs closed into a bud (withered). */
  petalOpenDeg: 15,
  petalClosedDeg: 78,
  /** Small extra petal flutter on a partner pulse (degrees). */
  petalPulseDeg: 8,
  centerRadius: 0.065,
  headMinScale: 0.8,
  idleSwayDeg: 1.2,
}

/** Unit-length petal in the XZ plane pointing along +X: rounded tip, cupped upward. */
function createPetalGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(0.15, 0.32, 0.85, 0.42, 1, 0)
  shape.bezierCurveTo(0.85, -0.42, 0.15, -0.32, 0, 0)
  const geometry = new THREE.ShapeGeometry(shape, 16)
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const w = pos.getY(i)
    pos.setXYZ(i, x, 0.9 * w * w + 0.12 * x * x, w)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** Unit-length leaf lying in the XZ plane, pointing along +X, gently cupped and curved. */
function createLeafGeometry() {
  const halfWidth = 0.25
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.quadraticCurveTo(0.35, halfWidth * 1.6, 1, 0)
  shape.quadraticCurveTo(0.35, -halfWidth * 1.6, 0, 0)
  const geometry = new THREE.ShapeGeometry(shape, 16)
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const w = pos.getY(i)
    // Midrib curves down towards the tip; the blade cups upward at its edges.
    const y = -0.16 * x * x + 1.2 * w * w
    pos.setXYZ(i, x, y, w)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** `material` glows (the petals only); `foliage` is the green, non-glowing stem, leaves and flower centre. */
export function createPlant(material: THREE.Material, foliage: THREE.Material): TwinForm {
  const geometries: THREE.BufferGeometry[] = []
  const track = <T extends THREE.BufferGeometry>(g: T) => (geometries.push(g), g)

  const root = new THREE.Group()
  const body = new THREE.Group() // leans toward camera from the base
  root.add(body)

  const leafGeometry = track(createLeafGeometry())
  const jointGeometry = track(new THREE.SphereGeometry(PLANT.stemRadius, 12, 8))

  // Articulated stem: each segment is nested in the previous, so bending the joints droops the top.
  const joints: THREE.Group[] = []
  let parent: THREE.Object3D = body
  let offset = 0
  for (const length of PLANT.segments) {
    const joint = new THREE.Group()
    joint.position.y = offset
    parent.add(joint)
    const segment = track(new THREE.CylinderGeometry(PLANT.stemRadius * 0.85, PLANT.stemRadius, length, 12))
    segment.translate(0, length / 2, 0)
    joint.add(new THREE.Mesh(segment, foliage))
    joint.add(new THREE.Mesh(jointGeometry, foliage))
    joints.push(joint)
    parent = joint
    offset = length
  }
  const totalHeight = PLANT.segments.reduce((a, b) => a + b, 0)

  // Leaves, spiralling round the stem (golden angle) so none hides another.
  const leaves = PLANT.leaves.map(([segmentIndex, height, length], i) => {
    const azimuth = new THREE.Group()
    azimuth.position.y = height
    azimuth.rotation.y = 0.6 + i * 137.5 * DEG
    joints[segmentIndex].add(azimuth)
    const elevation = new THREE.Group()
    azimuth.add(elevation)
    const blade = new THREE.Mesh(leafGeometry, foliage)
    blade.scale.setScalar(length)
    elevation.add(blade)
    return { elevation, blade, length, phase: i * 1.1 }
  })

  // Flower on top: green centre, glowing orange petals that open with health and close into a bud.
  const head = new THREE.Group()
  head.position.y = PLANT.segments[PLANT.segments.length - 1]
  head.rotation.x = PLANT.headTiltDeg * DEG
  joints[joints.length - 1].add(head)
  const centerGeometry = track(new THREE.SphereGeometry(PLANT.centerRadius, 24, 16))
  const center = new THREE.Mesh(centerGeometry, foliage)
  center.scale.set(1, 0.8, 1)
  head.add(center)
  const petalGeometry = track(createPetalGeometry())
  const petals = Array.from({ length: PLANT.petals }, (_, i) => {
    const azimuth = new THREE.Group()
    azimuth.rotation.y = (i / PLANT.petals) * Math.PI * 2
    head.add(azimuth)
    const elevation = new THREE.Group()
    elevation.position.x = PLANT.centerRadius * 0.5
    azimuth.add(elevation)
    const petal = new THREE.Mesh(petalGeometry, material)
    petal.scale.setScalar(PLANT.petalLength)
    elevation.add(petal)
    return { elevation, phase: i * 0.9 }
  })

  const leanAngle = Math.atan(LOOK.leanAmount / totalHeight)

  return {
    root,
    update(e) {
      const o = e.openness
      // Lean toward the camera while listening; tiny idle sway.
      body.rotation.x = e.lean * leanAngle
      body.rotation.z = e.idle * PLANT.idleSwayDeg * DEG

      // Stem droops sideways as health drops.
      const bend = lerp(PLANT.droopDeg, PLANT.healthyBendDeg, o) * DEG
      joints.forEach((joint, i) => (joint.rotation.z = i === 0 ? bend * 0.4 : bend))

      for (const leaf of leaves) {
        // Same peak tip displacement as the orb's pulse bob.
        const pulseAngle = Math.asin(Math.min(1, LOOK.pulseAmplitude / leaf.length))
        const wave = Math.sin(e.time * Math.PI * 2 * LOOK.pulseHz + leaf.phase) * e.pulse
        const rest = lerp(PLANT.leafDroopDeg, PLANT.leafOpenDeg, o) * DEG + e.idle * PLANT.leafIdleDeg * DEG + wave * pulseAngle
        // The louder the voice, the closer the leaf gets to perpendicular with the stem (0° elevation).
        leaf.elevation.rotation.z = lerp(rest, 0, e.voice * PLANT.leafVoiceAmount)
        leaf.blade.scale.z = leaf.length * lerp(PLANT.leafClosedWidth, 1, o)
      }

      // Petals open as health rises and close into a bud as it fades; they flutter on a pulse.
      for (const petal of petals) {
        const wave = Math.sin(e.time * Math.PI * 2 * LOOK.pulseHz + petal.phase) * e.pulse
        petal.elevation.rotation.z =
          (lerp(PLANT.petalClosedDeg, PLANT.petalOpenDeg, o) + wave * PLANT.petalPulseDeg + e.idle * 2) * DEG
      }
      head.scale.setScalar(lerp(PLANT.headMinScale, 1, o))
    },
    dispose: () => geometries.forEach((g) => g.dispose()),
  }
}
