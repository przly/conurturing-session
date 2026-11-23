/**
 * ─────────────────────────────────────────────────────────────
 *  WEATHER TEST: live intro (two linked plants)
 * ─────────────────────────────────────────────────────────────
 *  Two plants side by side. The recorded shadow behind a room is
 *  the person who is in THAT room, and it moves the plant in the
 *  OTHER room: your shadow (Amsterdam) opens your family's flower,
 *  your family's shadow (home) opens yours.
 *
 *  Times are seconds of intro time at normal speed. Each `plays`
 *  entry starts the recording (`WEATHER_CONFIG.presence.recording`)
 *  at video time `from` and plays it until `until`; the rest of the
 *  time the video holds an empty frame.
 */

export type Room = 'you' | 'family'

/** The recording behind both rooms (`public/videos/<name>.mp4` + `.cues.json`). */
export const INTRO_RECORDING = 'intro_movement'

/** Frame the video rests on when nobody is there: the empty room. */
const EMPTY_FRAME = 0
/** Frame where the person stands in the middle; the video pauses here while they "stay". */
const STANDING_FRAME = 2.4
/** Length of the recording. */
const RECORDING_SEC = 5.9

export interface Visit {
  /** Intro second the person starts walking in. */
  at: number
  /** How long the video pauses on the standing frame. */
  stay: number
}

/**
 * One visit: walks in (opens the other plant at about +1.6 s), stands for `stay`
 * seconds, then walks out (the other plant closes at about +3.3 s + `stay`).
 */
const visit = (at: number, stay: number): Visit => ({ at, stay })

export const INTRO_SCRIPT = {
  durationSec: 39.63,
  rooms: {
    // You, in Amsterdam: moves your family's plant.
    you: { label: 'Your room', visits: [visit(14.1, 3.4), visit(28, 12)] },
    // Your family, at home: moves your plant.
    family: { label: 'Your family home', visits: [visit(25.3, 9)] },
  } satisfies Record<Room, { label: string; visits: Visit[] }>,
  /** Voiceover captions keyed to the audio edit, in seconds. */
  captions: [
    { at: 0, text: 'There are two plants.' },
    { at: 1.59, text: 'One stays in your room, and you give the other one to your family.' },
    { at: 5.48, text: 'After you move abroad, the two plants stay connected over Wi-Fi.' },
    { at: 9.64, text: 'Each one can tell when someone is in the room.' },
    { at: 12.37, text: 'When you walk into your room,' },
    { at: 13.93, text: 'the flower back at your family’s home opens and starts to glow.' },
    { at: 17.79, text: 'It’s a small sign that you’re there.' },
    { at: 19.83, text: 'Once you leave, it closes again.' },
    { at: 22.29, text: 'It works the other way too.' },
    { at: 24.04, text: 'When your family walks into their room,' },
    { at: 26.05, text: 'your flower opens and glows.' },
    { at: 28.24, text: 'And if you’re both in your rooms at the same time,' },
    { at: 30.64, text: 'both flowers stay open.' },
    { at: 32.88, text: 'In this study, you’ll only see the flower in your room.' },
    { at: 36, text: 'The shadow in the background shows your family moving around back home.' },
  ],
}

// Each base glows while the narrator introduces its plant.
const FLOWER_INTRO_CUES: Record<Room, readonly [number, number]> = {
  you: [1.59, 3],
  family: [3.48, 4.95],
}

export function flowerEmphasisAt(room: Room, time: number) {
  const [start, end] = FLOWER_INTRO_CUES[room]
  if (time < start || time >= end) return 0
  return Math.min(1, (time - start) / 0.2, (end - time) / 0.35)
}

/**
 * Where the recording behind `room` should be at intro time `t`, and whether it is playing.
 * It rests on the empty frame, plays a visit, and pauses on the standing frame while the person stays.
 */
export function videoAt(room: Room, t: number) {
  for (const { at, stay } of INTRO_SCRIPT.rooms[room].visits) {
    const u = t - at
    if (u < 0 || u >= RECORDING_SEC + stay) continue
    if (u < STANDING_FRAME) return { time: u, playing: true }
    if (u < STANDING_FRAME + stay) return { time: STANDING_FRAME, playing: false }
    return { time: u - stay, playing: true }
  }
  return { time: EMPTY_FRAME, playing: false }
}

export function captionAt(t: number) {
  let index = 0
  INTRO_SCRIPT.captions.forEach((caption, i) => { if (t >= caption.at) index = i })
  return index
}
