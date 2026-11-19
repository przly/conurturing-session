import { WEATHER_CONFIG } from '@/config'

export interface ScheduledChange {
  /** Planned time (condition seconds). */
  target: number
  /** Actual time after moving away from cues. */
  at: number
  /** at − target. */
  shift: number
  /** False if no time within the allowed shift was clear of cues (the least-bad one is used). */
  clear: boolean
}

/**
 * Places each scripted weather change near its target time so the change
 * (from `at` to `at + duration`) stays `gap` seconds away from every
 * presence cue. Moves by at most `maxShift`; prefers the smallest move.
 * `cueTimes` are condition seconds (empty until the presence layer exists).
 */
export function scheduleChanges(
  cueTimes: number[],
  targets: number[] = WEATHER_CONFIG.transitionsAtSec,
  duration = WEATHER_CONFIG.transitionSec,
  maxShift = WEATHER_CONFIG.transitionMaxShiftSec,
  gap = WEATHER_CONFIG.transitionCueGapSec,
): ScheduledChange[] {
  // Distance from a change starting at `at` to the nearest cue (0 = overlaps).
  const clearance = (at: number) =>
    cueTimes.reduce((min, cue) => {
      const d = cue < at ? at - cue : cue > at + duration ? cue - (at + duration) : 0
      return Math.min(min, d)
    }, Infinity)

  return targets.map((target) => {
    let best = { at: target, clearance: clearance(target) }
    if (best.clearance >= gap) return { target, at: target, shift: 0, clear: true }
    // Try moves of 0.5 s, alternating later/earlier, smallest first.
    for (let step = 0.5; step <= maxShift; step += 0.5) {
      for (const at of [target + step, target - step]) {
        if (at < 0) continue
        const c = clearance(at)
        if (c >= gap) return { target, at, shift: at - target, clear: true }
        if (c > best.clearance) best = { at, clearance: c }
      }
    }
    return { target, at: best.at, shift: best.at - target, clear: false }
  })
}
