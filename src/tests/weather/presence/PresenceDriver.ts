import { WEATHER_CONFIG } from '@/config'
import type { TwinState } from '@/shared/scene/state'
import type { Cue, CueTrack } from './CueTrack'
import { PetalSpring } from './PetalSpring'

const config = WEATHER_CONFIG.presence

const smooth = (fraction: number) => {
  const p = Math.min(1, Math.max(0, fraction))
  return p * p * (3 - 2 * p)
}

const opennessAt = (x: number) =>
  config.entryOpenness + (1 - config.entryOpenness) * (1 - Math.abs(x - 0.5) * 2)

/** Evaluate the performance from the video timeline, including when starting mid-clip. */
export class PresenceDriver {
  mode = 'resting'
  x = 0.5
  previewPosition: number | null = null
  private readonly petals = new PetalSpring()
  private readonly state: TwinState = {
    health: config.restHealth, pulse: 0, listening: false, voice: 0,
    headOpenness: 0,
  }

  readonly track: CueTrack

  constructor(track: CueTrack) {
    this.track = track
  }

  get openness() {
    return this.state.headOpenness ?? 0
  }

  read = () => {
    if (this.previewPosition !== null) {
      this.mode = 'manual'
      this.x = this.previewPosition
      const target = opennessAt(this.x)
      this.updatePetals(target)
      this.state.health = config.restHealth + (1 - config.restHealth) * target
      this.state.pulse = 0
      return this.state
    }
    const time = this.track.video.currentTime
    let active = false
    let target = 0
    let startLevel = 0
    let changed = 0
    let pass = -Infinity
    let cueAtTime: Cue | undefined
    let inFrame = false
    let x = 0.5
    const energyAt = (at: number) => {
      const p = smooth((at - changed) / (target ? config.wakeSec : config.fadeSec))
      return startLevel + (target - startLevel) * p
    }
    for (const cue of this.track.cues) {
      if (cue.t > time) break
      cueAtTime = cue
      const { event } = cue
      if (event === 'enter' || event === 'behind') inFrame = true
      if (event === 'leave' || event === 'pass') inFrame = false
      if (cue.x !== undefined) x = cue.x
      if (event === 'behind' || event === 'leave') {
        startLevel = energyAt(cue.t)
        active = event === 'behind'
        target = Number(active)
        changed = cue.t
        if (!active) x = 0.5
      }
      if (event === 'pass') pass = cue.t
    }
    const level = energyAt(time)
    if (cueAtTime?.motion) {
      const { motion } = cueAtTime
      const progress = smooth((time - cueAtTime.t) / motion.seconds)
      x = motion.from + (motion.to - motion.from) * progress
      inFrame = x >= 0 && x <= 1
    }
    this.x = x
    const event = cueAtTime?.event
    const pulse = Math.max(0, 1 - (time - pass) / config.passSec)
    this.mode = active ? (event === 'still' ? 'still' : level < 1 ? 'waking' : 'present') :
      pulse > 0 ? 'passing' : level > 0 ? 'fading' : event === 'enter' || event === 'move' ? 'approaching' : 'resting'
    this.state.health = config.restHealth + (1 - config.restHealth) * level
    this.updatePetals(inFrame ? opennessAt(x) : 0)
    this.state.pulse = pulse
    return this.state
  }

  private updatePetals(target: number) {
    this.state.headOpenness = this.petals.update(target)
  }
}
