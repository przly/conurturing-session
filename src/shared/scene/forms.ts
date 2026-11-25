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
  update: (e: Expression, weather?: { rain: number; snow: number; lightning: number }) => void
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
function createPetalGeometry(petalWidthScale: number) {
  const lengthSegments = 24
  const widthSegments = 12
  const stride = widthSegments + 1
  const positions = [0, 0, 0]
  const uvs = [0, 0.5]
  const indices: number[] = []

  for (let row = 1; row < lengthSegments; row++) {
    const angle = Math.PI * row / lengthSegments
    const x = (1 - Math.cos(angle)) / 2
    const profile = Math.sin(angle)
    const halfWidth = profile * (0.20 + 0.15 * x) * petalWidthScale
    const curl = 0.09 * x * x + 0.075 * x ** 6
    for (let col = 0; col <= widthSegments; col++) {
      const side = 2 * col / widthSegments - 1
      const cup = 0.085 * profile * side * side
      const crease = 0.027 * profile * Math.exp(-22 * side * side)
      const twist = 0.033 * x * profile * side
      positions.push(x, curl + cup - crease + twist, side * halfWidth)
      uvs.push(x, col / widthSegments)
    }
  }

  const tip = positions.length / 3
  positions.push(1, 0.165, 0)
  uvs.push(1, 0.5)
  for (let col = 0; col < widthSegments; col++) {
    indices.push(0, col + 2, col + 1)
    for (let row = 0; row < lengthSegments - 2; row++) {
      const a = 1 + row * stride + col
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride)
    }
    const last = tip - stride + col
    indices.push(last, last + 1, tip)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
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

/** The Form plant uses glowing petals. A separate petal material moves the glow to the centre. */
export function createPlant(
  glow: THREE.Material,
  foliage: THREE.Material,
  { mattePetals, weatherLeaves, leafCount = PLANT.leaves.length, leafWidthScale = 1, leafRotationOffset = 0, stemRadiusScale = 1, stemHeightScale = 1, closedCenterLift = 0, centerScale = 1, petalWidthScale = 1, petalDrop = 0, closedPetalCurl = 0 }: {
    mattePetals?: THREE.Material
    weatherLeaves?: THREE.Material
    leafCount?: number
    leafWidthScale?: number
    leafRotationOffset?: number
    stemRadiusScale?: number
    stemHeightScale?: number
    closedCenterLift?: number
    centerScale?: number
    petalWidthScale?: number
    petalDrop?: number
    closedPetalCurl?: number
  } = {},
): TwinForm {
  const geometries: THREE.BufferGeometry[] = []
  const track = <T extends THREE.BufferGeometry>(g: T) => (geometries.push(g), g)

  const root = new THREE.Group()
  const body = new THREE.Group() // leans toward camera from the base
  root.add(body)

  const leafGeometry = track(createLeafGeometry())
  const stemRadius = PLANT.stemRadius * stemRadiusScale
  const jointGeometry = track(new THREE.SphereGeometry(stemRadius, 12, 8))

  // Articulated stem: each segment is nested in the previous, so bending the joints droops the top.
  const joints: THREE.Group[] = []
  let parent: THREE.Object3D = body
  let offset = 0
  const segmentLengths = PLANT.segments.map((length) => length * stemHeightScale)
  for (const length of segmentLengths) {
    const joint = new THREE.Group()
    joint.position.y = offset
    parent.add(joint)
    const segment = track(new THREE.CylinderGeometry(stemRadius * 0.85, stemRadius, length, 12))
    segment.translate(0, length / 2, 0)
    joint.add(new THREE.Mesh(segment, foliage))
    joint.add(new THREE.Mesh(jointGeometry, foliage))
    joints.push(joint)
    parent = joint
    offset = length
  }
  const totalHeight = segmentLengths.reduce((a, b) => a + b, 0)

  // Leaves, spiralling round the stem (golden angle) so none hides another.
  const leaves = PLANT.leaves.slice(0, leafCount).map(([segmentIndex, height, length], i) => {
    const azimuth = new THREE.Group()
    azimuth.position.y = height * stemHeightScale
    azimuth.rotation.y = 0.6 + (i * 137.5 + leafRotationOffset) * DEG
    joints[segmentIndex].add(azimuth)
    const elevation = new THREE.Group()
    azimuth.add(elevation)
    const blade = new THREE.Mesh(leafGeometry, weatherLeaves ?? foliage)
    blade.scale.setScalar(length)
    elevation.add(blade)
    return { elevation, blade, length, phase: i * 1.1 }
  })

  // Flower on top, with petals that open with health and close into a bud.
  const head = new THREE.Group()
  head.position.y = segmentLengths[segmentLengths.length - 1]
  head.rotation.x = PLANT.headTiltDeg * DEG
  joints[joints.length - 1].add(head)
  const centerGeometry = track(new THREE.SphereGeometry(PLANT.centerRadius * centerScale, 24, 16))
  const center = new THREE.Mesh(centerGeometry, mattePetals ? glow : foliage)
  center.scale.set(1, 0.8, 1)
  head.add(center)
  const petalGeometry = track(createPetalGeometry(petalWidthScale))
  const petalPositions = petalGeometry.getAttribute('position')
  const openPetalPositions = closedPetalCurl ? petalPositions.clone() : null
  let lastCurl = 0
  const petalCurvature = [1.1, 0.86, 1.05, 0.93, 1.16, 0.9]
  const petals = Array.from({ length: PLANT.petals }, (_, i) => {
    const azimuth = new THREE.Group()
    azimuth.rotation.y = (i / PLANT.petals) * Math.PI * 2
    head.add(azimuth)
    const elevation = new THREE.Group()
    elevation.position.set(PLANT.centerRadius * centerScale * 0.5, -petalDrop, 0)
    azimuth.add(elevation)
    const petal = new THREE.Mesh(petalGeometry, mattePetals ?? glow)
    petal.scale.setScalar(PLANT.petalLength)
    if (mattePetals) {
      petal.scale.y *= petalCurvature[i]
      petal.rotation.x = (petalCurvature[i] - 1) * 0.42
    }
    elevation.add(petal)
    return { elevation, phase: i * 0.9, lastDrop: -Infinity }
  })

  let nextDrop = 0
  let previousPetal = -1
  let startleTarget = 0
  let startle = 0
  let lastTime = 0
  const leanAngle = Math.atan(LOOK.leanAmount / totalHeight)

  return {
    root,
    update(e, weather) {
      const rain = weather?.rain ?? 0
      const snow = weather?.snow ?? 0
      const elapsed = e.time - lastTime
      lastTime = e.time
      startleTarget = Math.max(weather?.lightning ?? 0, startleTarget * Math.exp(-1.8 * elapsed))
      startle = THREE.MathUtils.damp(startle, startleTarget, 6, elapsed)
      const presence = e.headOpenness !== undefined
      const bodyOpenness = presence ? 1 : e.openness
      const petalOpenness = (e.headOpenness ?? e.openness) * (1 - 0.45 * startle)
      const closure = Math.max(0, 1 - petalOpenness)
      if (closedCenterLift) center.position.y = closedCenterLift * closure
      if (openPetalPositions) {
        const reveal = THREE.MathUtils.smoothstep(petalOpenness, 0.06, 0.4)
        center.visible = reveal > 0
        center.scale.set(reveal, 0.8 * reveal, reveal)
        const curl = closedPetalCurl * closure ** 2
        if (curl !== lastCurl) {
          for (let i = 0; i < petalPositions.count; i++) {
            const x = openPetalPositions.getX(i)
            const y = openPetalPositions.getY(i)
            const z = openPetalPositions.getZ(i)
            const angle = curl * x
            // Bend along the petal's length, with increasing curl toward the tip.
            petalPositions.setXYZ(i, curl ? Math.sin(angle) / curl : x, y + (curl ? (1 - Math.cos(angle)) / curl : 0), z)
          }
          petalPositions.needsUpdate = true
          petalGeometry.computeVertexNormals()
          lastCurl = curl
        }
      }
      const idle = presence ? 0 : e.idle
      const pulse = presence ? 0 : e.pulse
      // Lean toward the camera while listening; tiny idle sway.
      body.rotation.x = e.lean * leanAngle
      body.rotation.z = idle * PLANT.idleSwayDeg * DEG

      // Stem droops sideways as health drops.
      const bend = lerp(PLANT.droopDeg, PLANT.healthyBendDeg, bodyOpenness) * DEG
      joints.forEach((joint, i) => (joint.rotation.z = i === 0 ? bend * 0.4 : bend))

      for (const leaf of leaves) {
        // Same peak tip displacement as the orb's pulse bob.
        const pulseAngle = Math.asin(Math.min(1, LOOK.pulseAmplitude / leaf.length))
        const wave = Math.sin(e.time * Math.PI * 2 * LOOK.pulseHz + leaf.phase) * pulse
        const rest = lerp(PLANT.leafDroopDeg, PLANT.leafOpenDeg, bodyOpenness) * DEG + idle * PLANT.leafIdleDeg * DEG + wave * pulseAngle
        // The louder the voice, the closer the leaf gets to perpendicular with the stem (0° elevation).
        leaf.elevation.rotation.z = lerp(rest, 0, e.voice * PLANT.leafVoiceAmount)
        leaf.blade.scale.z = leaf.length * leafWidthScale * lerp(PLANT.leafClosedWidth, 1, bodyOpenness)
      }

      // Petals open as health rises and close into a bud as it fades; they flutter on a pulse.
      if (rain > 0 && e.time >= nextDrop) {
        const choices = previousPetal < 0 ? petals.length : petals.length - 1
        const choice = Math.floor(Math.random() * choices)
        const index = previousPetal >= 0 && choice >= previousPetal ? choice + 1 : choice
        petals[index].lastDrop = e.time
        previousPetal = index
        nextDrop = e.time + THREE.MathUtils.randFloat(0.45, 0.95)
      }
      const shiverDuration = 4 / 3
      const shiverPhase = Math.min((e.time % 3) / shiverDuration, 1)
      const shiverBurst = snow * Math.sin(shiverPhase * Math.PI) ** 3
      const shiverBeat = shiverPhase * shiverDuration * Math.PI * 12
      const tremble = shiverBurst * (0.72 + 0.28 * Math.cos(shiverBeat / 3))
      const coldTuck = 7 * petalOpenness * shiverBurst
      head.rotation.x = (PLANT.headTiltDeg + 10 * startle) * DEG
      head.rotation.z = (0.8 * tremble * Math.sin(shiverBeat) - 6 * startle) * DEG
      for (const petal of petals) {
        const wave = Math.sin(e.time * Math.PI * 2 * LOOK.pulseHz + petal.phase) * pulse
        const sinceDrop = e.time - petal.lastDrop
        const dip = THREE.MathUtils.smoothstep(sinceDrop, 0, 0.16)
        const recovery = 1 - THREE.MathUtils.smoothstep(sinceDrop, 0.16, 0.85)
        const rainDip = 5 * rain * petalOpenness * dip * recovery
        const shiver = coldTuck + 2.5 * tremble * Math.sin(shiverBeat + petal.phase * 0.25)
        const shake = 1.5 * (e.petalShake ?? 0) * Math.sin(e.time * Math.PI * 8 + petal.phase)
        petal.elevation.rotation.z =
          (lerp(PLANT.petalClosedDeg, PLANT.petalOpenDeg, petalOpenness) + wave * PLANT.petalPulseDeg + idle * 2 - rainDip + shiver + shake) * DEG
      }
      head.scale.setScalar(lerp(PLANT.headMinScale, 1, bodyOpenness))
    },
    dispose: () => geometries.forEach((g) => g.dispose()),
  }
}
