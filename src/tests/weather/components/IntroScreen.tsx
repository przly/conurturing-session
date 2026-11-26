import { useEffect, useRef, useState } from 'react'
import { ChevronRight, User, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SPEED, URL_PARAMS, WEATHER_CONFIG } from '@/config'
import { Screen } from '@/shared/components/Screen'
import { TwinCanvas } from '@/shared/components/TwinCanvas'
import type { TwinState } from '@/shared/scene/state'
import type { VideoBackdropOptions } from '@/shared/scene/VideoBackdrop'
import type { WeatherLook } from '@/shared/scene/weather'
import { INTRO_RECORDING, INTRO_SCRIPT, captionAt, flowerEmphasisAt, videoAt, type Room } from '../introScript'
import { loadPresence, type CueTrack } from '../presence/CueTrack'
import { PresenceDriver } from '../presence/PresenceDriver'
import { STUDY_TEXT as copy } from '../text'

interface IntroScreenProps {
  hometown?: string | null
  inlineTrigger?: boolean
  onStart: () => void
  onEnd: (watched: number, skipped: boolean) => void
  onContinue: () => void
}

const ROOMS = ['you', 'family'] as const
const { floorDepthRadius } = WEATHER_CONFIG.presence
/** Floor reaches the bottom edge of the full-height scene. */
const FLOOR_FRONT_EXTEND = 2
/** Each room holds its own weather throughout the intro. */
function roomLook(weather: WeatherLook['from']): () => WeatherLook {
  const state = URL_PARAMS.weather ?? weather
  const look = { from: state, to: state, mix: 1, night: 0 }
  return () => look
}

const ROOM_LOOK = { you: roomLook('cloudy'), family: roomLook('clear') }

/** A paused video shows nothing until its first frame is decoded; this waits for that (or gives up after 5 s). */
function frameReady(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    if (video.readyState >= 2) return resolve()
    const done = () => {
      clearTimeout(timer)
      video.removeEventListener('loadeddata', done)
      video.removeEventListener('seeked', done)
      resolve()
    }
    const timer = setTimeout(done, 5000)
    video.addEventListener('loadeddata', done)
    video.addEventListener('seeked', done)
    // Browsers that don't preload (iOS) only decode a frame after a seek.
    video.currentTime = 0.001
  })
}

/** One room: its recording is the backdrop, and the OTHER room's recording moves its plant. */
class LinkedPlant {
  readonly track: CueTrack
  readonly backdrop: VideoBackdropOptions
  private readonly driver: PresenceDriver
  private readonly state: TwinState = { health: WEATHER_CONFIG.presence.restHealth, pulse: 0, listening: false, voice: 0, headOpenness: 0 }
  private last: number | null = null
  private starting = false

  constructor(track: CueTrack, source: CueTrack) {
    this.track = track
    this.driver = new PresenceDriver(source)
    this.backdrop = { video: track.video, ...WEATHER_CONFIG.presence }
  }

  /** Follow the script: play the recording during a visit, hold an empty frame otherwise. */
  sync(room: Room, t: number) {
    this.state.flowerEmphasis = flowerEmphasisAt(room, t)
    const { video } = this.track
    const target = videoAt(room, t)
    if (target.playing) {
      // Only seek on real drift: seeking every frame would keep the picture from ever decoding.
      if (Math.abs(video.currentTime - target.time) > 0.5) video.currentTime = target.time
      if (video.paused && !this.starting) {
        this.starting = true
        void video.play().catch(() => {}).finally(() => { this.starting = false })
      }
    } else {
      if (!video.paused) video.pause()
      if (Math.abs(video.currentTime - target.time) > 0.05) video.currentTime = target.time
    }
  }

  /** Must run inside a click: lets the browser play this video later without another gesture. */
  unlock() {
    void this.track.video.play().catch(() => {})
  }

  /** Same as the condition (driven by the other room's shadow), but health eases so seeking back for a second visit doesn't jump. */
  read = () => {
    const state = this.driver.read()
    const now = performance.now()
    const dt = this.last === null ? 1 : (now - this.last) / 1000
    this.last = now
    this.state.health += (state.health - this.state.health) * Math.min(1, dt * SPEED * 2)
    this.state.pulse = state.pulse
    this.state.headOpenness = state.headOpenness
    return this.state
  }

  dispose() {
    this.track.video.pause()
    this.track.video.removeAttribute('src')
    this.track.video.load()
  }
}

/** Live intro: two linked 3D plants side by side, each with the shadow video behind it, plus captions. */
export function IntroScreen({ hometown, inlineTrigger = false, onStart, onEnd, onContinue }: IntroScreenProps) {
  const [plants, setPlants] = useState<Record<Room, LinkedPlant> | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [caption, setCaption] = useState(0)
  const [done, setDone] = useState(false)
  /** Browsers only let the videos play after a click, as with Begin in the conditions. */
  const [started, setStarted] = useState(false)
  const voiceoverRef = useRef<HTMLAudioElement>(null)
  const voiceoverFailed = useRef(false)
  const startedAt = useRef<number | null>(null)
  const ended = useRef(false)
  const speed = inlineTrigger ? 1 : SPEED
  const callbacks = useRef({ onStart, onEnd })
  useEffect(() => { callbacks.current = { onStart, onEnd } })

  const watchedSec = () => (startedAt.current === null ? 0 : (performance.now() - startedAt.current) / 1000)

  const finish = (skipped: boolean) => {
    if (ended.current) return
    ended.current = true
    voiceoverRef.current?.pause()
    callbacks.current.onEnd(watchedSec(), skipped)
    if (skipped) onContinue()
    else setDone(true)
  }
  const finishRef = useRef(finish)
  useEffect(() => { finishRef.current = finish })

  // Load one copy of the recording per plant.
  useEffect(() => {
    const controller = new AbortController()
    let loaded: LinkedPlant[] = []
    const load = () => loadPresence(1, 0, controller.signal, `/videos/${INTRO_RECORDING}`)
    Promise.all([load(), load()])
      .then(async ([you, family]) => {
        for (const track of [you, family]) track.video.loop = false
        loaded = [new LinkedPlant(you, family), new LinkedPlant(family, you)]
        await Promise.all([you, family].map((track) => frameReady(track.video)))
        controller.signal.throwIfAborted()
        setPlants({ you: loaded[0], family: loaded[1] })
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => {
      controller.abort()
      loaded.forEach((plant) => plant.dispose())
    }
  }, [attempt])

  // Run the script once both recordings are ready and the participant pressed Play.
  useEffect(() => {
    if (!plants || !started) return
    const voiceover = voiceoverRef.current
    startedAt.current = performance.now()
    callbacks.current.onStart()
    let frame = 0
    const tick = () => {
      const usesVoiceover = voiceover && !voiceoverFailed.current && !voiceover.error
      const elapsed = usesVoiceover
        ? voiceover.currentTime
        : watchedSec() * speed
      const t = Math.min(INTRO_SCRIPT.durationSec, elapsed)
      setCaption(captionAt(t))
      for (const room of ROOMS) plants[room].sync(room, t)
      if (usesVoiceover ? voiceover.ended : t >= INTRO_SCRIPT.durationSec) {
        finishRef.current(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      voiceover?.pause()
    }
  }, [plants, started, speed])

  const captionText = INTRO_SCRIPT.captions[caption].text
  const play = () => {
    if (!plants) return
    for (const room of ROOMS) plants[room].unlock()
    void voiceoverRef.current?.play().catch(() => { voiceoverFailed.current = true })
    setStarted(true)
  }
  const retry = () => {
    setFailed(false)
    setAttempt(attempt + 1)
  }

  const intro = (
    <div
      className={`pointer-events-auto fixed inset-0 bg-[#0d0e11] ${inlineTrigger ? 'z-20' : ''}`}
      role="region"
      aria-label={copy.introTitle}
    >
      <div className="flex size-full">
        {plants && ROOMS.map((room, i) => (
          <div key={room} className={`relative min-w-0 flex-1 ${i ? 'border-l border-white/15' : ''}`}>
            <TwinCanvas
              form="plant"
              getState={plants[room].read}
              getWeather={ROOM_LOOK[room]}
              petalColor={room === 'family' ? '#f5d5e7' : undefined}
              petalWidthScale={room === 'family' ? 1.16 : undefined}
              leafWidthScale={room === 'family' ? 1.4 : undefined}
              leafRotationOffset={room === 'family' ? 65 : undefined}
              backdrop={plants[room].backdrop}
              floorDepthRadius={floorDepthRadius}
              floorFrontExtend={FLOOR_FRONT_EXTEND}
            />
            <Badge
              className="pointer-events-none absolute top-16 left-1/2 h-auto max-w-[calc(100%-1rem)] -translate-x-1/2 gap-2 rounded-full border-[0.5px] border-white/10 bg-black px-3 py-1.5 text-center text-base leading-tight whitespace-normal text-white sm:h-auto sm:text-base"
            >
              {room === 'you'
                ? <User aria-hidden="true" size={18} strokeWidth={2.5} className="size-[1em]" />
                : <Users aria-hidden="true" size={18} strokeWidth={2.5} className="size-[1em]" />}
              <span>
                {INTRO_SCRIPT.rooms[room].label}
                {room === 'family' && hometown && ` (${hometown})`}
              </span>
            </Badge>
          </div>
        ))}
      </div>
      {plants && started && !done && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4" aria-live="polite">
          <p
            key={captionText}
            className="max-w-xl text-center text-pretty text-2xl text-yellow-300 animate-in fade-in duration-500"
            style={{
              textShadow: [
                '2px 0 black', '1.73px 1px black', '1px 1.73px black',
                '0 2px black', '-1px 1.73px black', '-1.73px 1px black',
                '-2px 0 black', '-1.73px -1px black', '-1px -1.73px black',
                '0 -2px black', '1px -1.73px black', '1.73px -1px black',
              ].join(', '),
            }}
          >
            {captionText}
          </p>
        </div>
      )}
      {plants && !started && (
        <Button
          size="lg"
          className="absolute top-1/2 left-1/2 -translate-1/2"
          onClick={play}
        >
          {copy.playIntro}
        </Button>
      )}
      {!done && !failed && <Button className="absolute top-4 right-4" onClick={() => finish(true)}>{inlineTrigger ? 'Stop explanation' : copy.skipIntro}</Button>}
      {done && (
        <div className="absolute inset-0 grid place-items-center bg-black/50">
          <Button size="lg" onClick={onContinue}>
            {copy.continue}
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 bg-background">
          <Screen title={copy.introTitle} description={copy.introError}>
            <div className="flex flex-wrap gap-2">
              <Button onClick={retry}>{copy.retry}</Button>
              <Button variant="outline" onClick={() => finish(true)}>{copy.skipIntro}</Button>
            </div>
          </Screen>
        </div>
      )}
    </div>
  )

  return (
    <>
      {speed === 1 && (
        <audio ref={voiceoverRef} src="/audio/intro-voiceover-synced.mp3" preload="auto" />
      )}
      {inlineTrigger && !started ? (
        <div className="space-y-2">
          {failed && <p role="alert" className="rounded-md bg-black/75 px-3 py-2 text-sm">{copy.introError}</p>}
          <Button variant="outline" className="pointer-events-auto" disabled={!plants && !failed} onClick={failed ? retry : play}>
            {failed ? copy.retry : 'Play explanation'}
          </Button>
        </div>
      ) : intro}
    </>
  )
}
