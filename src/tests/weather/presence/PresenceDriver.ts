import { WEATHER_CONFIG } from '@/config'
import type { TwinState } from '@/shared/scene/state'
import type { CueTrack } from './CueTrack'

const config = WEATHER_CONFIG.presence

/** Evaluate the performance from the video timeline, including when starting mid-clip. */
export class PresenceDriver {
  mode = 'resting'
  x = 0.5
  private readonly state: TwinState = {
    health: config.restHealth, pulse: 0, listening: false, voice: 0,
    leanX: 0, idleRate: 1, preventDroop: true,
  }

  readonly track: CueTrack

  constructor(track: CueTrack) {
    this.track = track
  }

  read = () => {
    const time = this.track.video.currentTime
    let active = false
    let target = 0
    let startLevel = 0
    let changed = 0
    let pass = -Infinity
    let event = ''
    let x = 0.5
    const energyAt = (at: number) => {
      const p = Math.min(1, Math.max(0, (at - changed) / (target ? config.wakeSec : config.fadeSec)))
      return startLevel + (target - startLevel) * p * p * (3 - 2 * p)
    }
    for (const cue of this.track.cues) {
      if (cue.t > time) break
      event = cue.event
      if (cue.x !== undefined) x = cue.x
      if (event === 'enter' || event === 'leave') {
        startLevel = energyAt(cue.t)
        active = event === 'enter'
        target = Number(active)
        changed = cue.t
        if (!active) x = 0.5
      }
      if (event === 'pass') pass = cue.t
    }
    const level = energyAt(time)
    this.x = x
    const pulse = Math.max(0, 1 - (time - pass) / config.passSec)
    this.mode = active ? (event === 'still' ? 'still' : level < 1 ? 'waking' : 'present') :
      pulse > 0 ? 'passing' : level > 0 ? 'fading' : 'resting'
    this.state.health = config.restHealth + (1 - config.restHealth) * level
    this.state.leanX = active ? (x * 2 - 1) * config.leanDegrees * Math.PI / 180 : 0
    this.state.idleRate = this.mode === 'still' ? config.stillIdleRate : 1
    this.state.pulse = pulse
    return this.state
  }
}
