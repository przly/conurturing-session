import { WEATHER_CONFIG } from '@/config'

const config = WEATHER_CONFIG.presence

/** Damped spring for petal openness; keeps its momentum when the target changes. */
export class PetalSpring {
  private time: number | null = null
  private velocity = 0
  position = 0

  /** Advance to `target` (0–1) and return the clamped openness. */
  update(target: number) {
    const now = performance.now()
    const previous = this.time
    this.time = now
    if (previous === null) {
      this.position = target
      return target
    }

    const dt = (now - previous) / 1000
    const rate = config.petalSpringRate
    const envelope = rate * config.petalSpringDamping
    const frequency = Math.sqrt(rate * rate - envelope * envelope)
    const offset = this.position - target
    const momentum = (this.velocity + envelope * offset) / frequency
    const decay = Math.exp(-envelope * dt)
    const phase = frequency * dt
    const displacement = offset * Math.cos(phase) + momentum * Math.sin(phase)
    this.velocity = decay * (frequency * (momentum * Math.cos(phase) - offset * Math.sin(phase)) - envelope * displacement)
    this.position = target + decay * displacement
    return Math.min(1, Math.max(0, this.position))
  }
}
