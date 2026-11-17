import * as THREE from 'three'
import { LOOK, lerp, type Expression } from './expression'

/**
 * The two forms. Both:
 *  - use the shared material (driven in `applyGlow`)
 *  - map `openness` to their pose with the same easing (already in `Expression`)
 *  - breathe with `idle`, move with `pulseWave` (same peak displacement),
 *    and lean toward the camera with `lean` (same displacement at the top).
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
      body.scale.setScalar(lerp(ORB.minScale, 1, o) * (1 + e.idle * ORB.idleScale))
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
  leafOpenDeg: 28,
  leafDroopDeg: -58,
  /** Leaf width when withered (closed) vs healthy. */
  leafClosedWidth: 0.5,
  leafIdleDeg: 3,
  budRadius: 0.1,
  budMinScale: 0.7,
  idleSwayDeg: 1.2,
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

export function createPlant(material: THREE.Material): TwinForm {
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
    joint.add(new THREE.Mesh(segment, material))
    joint.add(new THREE.Mesh(jointGeometry, material))
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
    const blade = new THREE.Mesh(leafGeometry, material)
    blade.scale.setScalar(length)
    elevation.add(blade)
    return { elevation, blade, length, phase: i * 1.1 }
  })

  // Bud on top.
  const bud = new THREE.Group()
  bud.position.y = PLANT.segments[PLANT.segments.length - 1] + PLANT.budRadius * 0.6
  joints[joints.length - 1].add(bud)
  const budGeometry = track(new THREE.SphereGeometry(PLANT.budRadius, 32, 24))
  const budMesh = new THREE.Mesh(budGeometry, material)
  budMesh.scale.set(1, 1.35, 1)
  bud.add(budMesh)

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
        leaf.elevation.rotation.z =
          lerp(PLANT.leafDroopDeg, PLANT.leafOpenDeg, o) * DEG + e.idle * PLANT.leafIdleDeg * DEG + wave * pulseAngle
        leaf.blade.scale.z = leaf.length * lerp(PLANT.leafClosedWidth, 1, o)
      }

      bud.scale.setScalar(lerp(PLANT.budMinScale, 1, o))
    },
    dispose: () => geometries.forEach((g) => g.dispose()),
  }
}
