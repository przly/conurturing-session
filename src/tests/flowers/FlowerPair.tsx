import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { WEATHER_CONFIG } from '@/config'
import { TwinCanvas } from '@/shared/components/TwinCanvas'
import { supabase } from '@/shared/data/supabase'
import type { TwinState } from '@/shared/scene/state'
import { startFaceTracking, type TrackedFace } from './faceTracking'

type Seat = 'a' | 'b'
type FlowerMode = 'pair' | 'observe'
type PracticeProgress = { step: number; holdSeconds: number | null }
const SIGNAL_INTERVAL = 125
const SIGNAL_TIMEOUT = 2000
const BLOOM_RESPONSE_MS = 160
const EDGE_OPENNESS = 0.3
const CENTER_TOLERANCE = 0.05
const FULL_BLOOM_FACE_SIZE = 0.24
const FAR_FACE_SIZE = 0.12
const FAR_OPENNESS = 0.05
const GLOW_START_FACE_SIZE = 0.19
const FULL_GLOW_FACE_SIZE = 0.35
const MAX_PETAL_OPENNESS = 1.23
const PEAK_CENTER_GLOW = 6
const SHAKE_START_GLOW = 0.75
const PRACTICE_HOLD_MS = 5000
const PRACTICE_POSES: { instruction: string; observerInstruction: string; cameraPrompt: string; matches: (face: TrackedFace | null) => boolean }[] = [
  {
    instruction: 'Move back to close the petals.',
    observerInstruction: 'Watch the petals close as the controller moves back.',
    cameraPrompt: 'Move back',
    matches: (face) => face !== null && face.size <= (FAR_FACE_SIZE + FULL_BLOOM_FACE_SIZE) / 2,
  },
  {
    instruction: 'Move left or right.',
    observerInstruction: 'Watch the flower as the controller moves to one side.',
    cameraPrompt: 'Move left or right',
    matches: (face) => face !== null && Math.abs(face.horizontalPosition - 0.5) >= 0.25,
  },
  {
    instruction: 'Center your face and move very close.',
    observerInstruction: 'Watch the petals spread and shake as the controller moves closer.',
    cameraPrompt: 'Center and move closer',
    matches: (face) => face !== null && Math.abs(face.horizontalPosition - 0.5) <= 0.15 && glowFor(face.size) >= SHAKE_START_GLOW,
  },
  {
    instruction: 'Step completely out of the frame.',
    observerInstruction: 'Watch the flower close as the controller leaves the frame.',
    cameraPrompt: 'Leave the frame',
    matches: (face) => face === null,
  },
]

function opennessFor(face: TrackedFace | null) {
  if (!face) return 0
  const distanceFromCenter = Math.abs(face.horizontalPosition - 0.5)
  const closing = Math.min(1, Math.max(0, (distanceFromCenter - CENTER_TOLERANCE) / (0.5 - CENTER_TOLERANCE)))
  const horizontalOpenness = 1 - (1 - EDGE_OPENNESS) * closing * closing * (3 - 2 * closing)
  const proximity = Math.min(1, Math.max(0, (face.size - FAR_FACE_SIZE) / (FULL_BLOOM_FACE_SIZE - FAR_FACE_SIZE)))
  const proximityOpenness = FAR_OPENNESS + (1 - FAR_OPENNESS) * proximity
  const closeRange = Math.min(1, Math.max(0, (face.size - FULL_BLOOM_FACE_SIZE) / (FULL_GLOW_FACE_SIZE - FULL_BLOOM_FACE_SIZE)))
  const extraOpening = (MAX_PETAL_OPENNESS - 1) * closeRange
  return horizontalOpenness * (proximityOpenness + extraOpening)
}

function glowFor(size: number) {
  const progress = (size - GLOW_START_FACE_SIZE) / (FULL_GLOW_FACE_SIZE - GLOW_START_FACE_SIZE)
  return Math.min(1, Math.max(0, progress))
}

// The Weather study's presence-only condition uses its flower in studio lighting.
const studioLook = () => null

export default function FlowerPair({ mode = 'pair' }: { mode?: FlowerMode }) {
  const params = new URLSearchParams(window.location.search)
  const room = params.get('room')
  const seat = params.get('seat')

  if (room && /^[a-zA-Z0-9_-]{8,80}$/.test(room) && (seat === 'a' || seat === 'b')) {
    return <FlowerStage room={room} seat={seat} mode={mode} />
  }
  return <PairSetup mode={mode} />
}

function PairSetup({ mode }: { mode: FlowerMode }) {
  const [room] = useState(() => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(''))
  const observe = mode === 'observe'
  const link = (seat: Seat) => observe ? `/observe?room=${room}&seat=${seat}` : `?test=flowers&room=${room}&seat=${seat}`

  return (
    <main className="grid min-h-dvh place-items-center bg-[#0d0e11] p-6 text-[#f5f1f8]">
      <div className="w-full max-w-sm space-y-5">
        <h1 className="text-3xl font-medium">{observe ? 'Observe test' : 'Twin flowers'}</h1>
        {supabase ? (
          <>
            <p className="text-[#ccc5d1]">{observe
              ? 'Open the controller link on the computer with the camera. Share the observer link with the other participant.'
              : 'Open Flower A here and share the Flower B link with your partner.'}</p>
            <div className="flex flex-wrap gap-3">
              <a className="rounded-md bg-[#eee4f7] px-4 py-2 text-[#17111c]" href={link('a')}>{observe ? 'Open controller' : 'Open Flower A'}</a>
              <a className="rounded-md border border-[#8e8198] px-4 py-2" href={link('b')}>{observe ? 'Open observer' : 'Flower B link'}</a>
            </div>
            <input className="w-full rounded-md border border-[#8e8198] bg-transparent p-2 text-sm" aria-label={observe ? 'Shareable observer link' : 'Shareable Flower B link'} readOnly value={new URL(link('b'), window.location.href).href} onFocus={(event) => event.currentTarget.select()} />
          </>
        ) : <p role="status">Set up the project’s Supabase connection to create a flower pair.</p>}
      </div>
    </main>
  )
}

function FlowerStage({ room, seat, mode }: { room: string; seat: Seat; mode: FlowerMode }) {
  const observe = mode === 'observe'
  const observer = observe && seat === 'b'
  const controller = observe && seat === 'a'
  const selfPreview = !observe && import.meta.env.DEV && room === 'local-flower-preview'
  const [joined, setJoined] = useState(false)
  const [practiceStep, setPracticeStep] = useState(0)
  const [holdSeconds, setHoldSeconds] = useState<number | null>(null)
  const practicing = !observer && !selfPreview && !joined
  const practicePose = practicing ? PRACTICE_POSES[practiceStep] : undefined
  const practiceProgress = useRef<PracticeProgress | null>(null)
  const [observerPractice, setObserverPractice] = useState<PracticeProgress | null>(null)
  const useOwnCamera = controller || selfPreview || practicing
  const connectToRoom = !selfPreview && (!practicing || controller)
  const waitingForSignal = observer ? 'Waiting for the controller…' : 'Waiting for the other flower…'
  const video = useRef<HTMLVideoElement>(null)
  const localFace = useRef<TrackedFace | null>(null)
  const partner = useRef({ openness: 0, glow: 0, received: -Infinity })
  const [connection, setConnection] = useState(supabase ? 'Connecting flowers…' : 'Set up the Supabase connection to pair flowers.')
  const [camera, setCamera] = useState<'off' | 'starting' | 'on'>('off')
  const [trackedFace, setTrackedFace] = useState<TrackedFace | null>(null)
  const [cameraError, setCameraError] = useState('')
  const bloom = useRef({ openness: 0, glow: 0, updated: 0 })

  useEffect(() => {
    if (controller) practiceProgress.current = practicing ? { step: practiceStep, holdSeconds } : null
  }, [controller, practicing, practiceStep, holdSeconds])

  useEffect(() => {
    if (!connectToRoom) return
    const client = supabase
    if (!client) return
    let active = true
    let subscribed = false
    const connect = () => client.channel(`flower-${mode}-${room}`)
      .on('broadcast', { event: 'face' }, ({ payload }) => {
        if (controller || !active || payload?.seat !== (seat === 'a' ? 'b' : 'a') || typeof payload.present !== 'boolean') return
        const openness = Number.isFinite(payload.openness)
          ? Math.min(MAX_PETAL_OPENNESS, Math.max(0, payload.openness))
          : Number(payload.present)
        const glow = Number.isFinite(payload.glow) ? Math.min(1, Math.max(0, payload.glow)) : Math.min(1, openness)
        partner.current = { openness, glow, received: performance.now() }
        if (observer) {
          const progress = payload.practice
          setObserverPractice((current) => {
            if (!Number.isInteger(progress?.step) || progress.step < 0 || progress.step > PRACTICE_POSES.length) return null
            const remaining = progress.holdSeconds
            const holdSeconds = Number.isInteger(remaining) && remaining >= 1 && remaining <= PRACTICE_HOLD_MS / 1000 ? remaining : null
            return current && current.step === progress.step && current.holdSeconds === holdSeconds
              ? current
              : { step: progress.step, holdSeconds }
          })
        }
        setConnection('')
      })
      .subscribe((status) => {
        if (!active) return
        subscribed = status === 'SUBSCRIBED'
        if (!subscribed) partner.current.received = -Infinity
        setConnection(subscribed ? controller ? '' : waitingForSignal : 'Reconnecting flowers…')
      })

    // Delay the join until after React's development-only effect replay.
    let channel: ReturnType<typeof connect> | undefined
    const join = window.setTimeout(() => { channel = connect() }, 0)
    const timer = window.setInterval(() => {
      if (!subscribed) return
      if (!controller && performance.now() - partner.current.received > SIGNAL_TIMEOUT) {
        setConnection(waitingForSignal)
        if (observer) setObserverPractice(null)
      }
      if (observer) return
      const face = document.hidden ? null : localFace.current
      void channel?.send({
        type: 'broadcast',
        event: 'face',
        payload: {
          seat,
          present: face !== null,
          openness: opennessFor(face),
          glow: glowFor(face?.size ?? 0),
          practice: controller ? practiceProgress.current : undefined,
        },
      })
    }, SIGNAL_INTERVAL)
    return () => {
      active = false
      window.clearTimeout(join)
      window.clearInterval(timer)
      partner.current.received = -Infinity
      if (channel) void client.removeChannel(channel)
    }
  }, [room, seat, mode, connectToRoom, controller, observer, waitingForSignal])

  const cameraRequested = !observer && camera !== 'off'
  useEffect(() => {
    if (!cameraRequested || !video.current) return
    const controller = new AbortController()
    startFaceTracking(video.current, controller.signal, (face) => {
      localFace.current = face
      setTrackedFace(face)
      setCamera('on')
    }, (message) => {
      localFace.current = null
      setTrackedFace(null)
      setHoldSeconds(null)
      setCameraError(message)
      setCamera('off')
    })
    return () => {
      localFace.current = null
      controller.abort()
    }
  }, [cameraRequested])

  useEffect(() => {
    if (!practicePose || camera !== 'on') return
    let heldSince: number | null = null
    const resetHold = () => {
      heldSince = null
      setHoldSeconds(null)
    }
    const timer = window.setInterval(() => {
      const now = performance.now()
      const face = localFace.current
      if (document.hidden || (face && now - face.detectedAt > 250) || !practicePose.matches(face)) {
        resetHold()
        return
      }
      heldSince ??= now
      const remaining = PRACTICE_HOLD_MS - (now - heldSince)
      if (remaining <= 0) {
        window.clearInterval(timer)
        setHoldSeconds(null)
        setPracticeStep(practiceStep + 1)
        return
      }
      setHoldSeconds(Math.ceil(remaining / 1000))
    }, 100)
    document.addEventListener('visibilitychange', resetHold)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', resetHold)
    }
  }, [camera, practicePose, practiceStep])

  const readFlower = (): TwinState => {
    const now = performance.now()
    const { openness: partnerOpenness, glow: partnerGlow, received } = partner.current
    const connected = now - received <= SIGNAL_TIMEOUT
    const targetOpenness = useOwnCamera ? opennessFor(localFace.current) : connected ? partnerOpenness : 0
    const targetGlow = useOwnCamera ? glowFor(localFace.current?.size ?? 0) : connected ? partnerGlow : 0
    const { openness, glow, updated } = bloom.current
    const decay = Math.exp(-Math.min(now - updated, 100) / BLOOM_RESPONSE_MS)
    const next = targetOpenness + (openness - targetOpenness) * decay
    const nextGlow = targetGlow + (glow - targetGlow) * decay
    bloom.current = { openness: next, glow: nextGlow, updated: now }
    const { restHealth } = WEATHER_CONFIG.presence
    return {
      health: restHealth + (1 - restHealth) * Math.min(1, next),
      pulse: 0,
      listening: false,
      voice: 0,
      headOpenness: next,
      petalShake: Math.max(0, (nextGlow - SHAKE_START_GLOW) / (1 - SHAKE_START_GLOW)),
      flowerCenterGlow: PEAK_CENTER_GLOW * nextGlow,
    }
  }

  const centered = trackedFace !== null && Math.abs(trackedFace.horizontalPosition - 0.5) <= CENTER_TOLERANCE
  const onTarget = centered && trackedFace.size >= FULL_BLOOM_FACE_SIZE
  const guideOnTarget = practicing ? holdSeconds !== null : onTarget
  const cameraPrompt = practicing
    ? holdSeconds !== null ? `Observe the flower for ${holdSeconds}s` : practicePose?.cameraPrompt
    : onTarget ? 'Full bloom position' : centered ? 'Move closer' : 'Center your face'
  const observerPose = observerPractice && PRACTICE_POSES[observerPractice.step]

  return (
    <main className="fixed inset-0 bg-[#0d0e11] text-[#f5f1f8]" aria-label={observe ? observer ? 'Observer flower' : 'Controller flower' : `Flower ${seat.toUpperCase()}`}>
      <TwinCanvas
        form="plant"
        getState={readFlower}
        getWeather={studioLook}
        disableFog
        disablePostProcessing
        cameraTargetY={0.95}
        stemHeightScale={0.9}
        floorDepthRadius={WEATHER_CONFIG.presence.floorDepthRadius}
      />
      {observerPractice && (
        <section aria-labelledby="observe-practice-title" className="absolute inset-x-4 top-4 mx-auto max-w-sm space-y-2 rounded-lg bg-black/85 p-4 text-center">
          <h1 id="observe-practice-title" className="font-medium">Flower practice</h1>
          <p>{observerPose?.observerInstruction ?? 'Practice complete. The controller will start the test.'}</p>
          <p role="status" className="text-sm tabular-nums">
            {observerPractice.holdSeconds !== null && `Observe the flower for ${observerPractice.holdSeconds}s`}
          </p>
        </section>
      )}
      <div className={practicing ? 'absolute inset-x-2 top-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3' : 'contents'}>
        {practicePose && (
          <section aria-labelledby="flower-practice-title" className="col-start-1 row-start-1 w-full min-w-0 max-w-56 justify-self-end space-y-2 rounded-lg bg-black/85 p-2 text-sm leading-snug sm:p-4 sm:text-base">
            <h1 id="flower-practice-title" className="font-medium sm:text-lg">Flower practice</h1>
            <p>{practicePose.instruction}</p>
            {camera !== 'on' && <p className="text-[#ccc5d1]">Enable your camera.</p>}
          </section>
        )}
        {!practicing && (selfPreview || connection) && (
          <p role="status" className="absolute bottom-4 left-4 rounded-md bg-black/75 px-3 py-2 text-sm">
            {selfPreview ? 'Local camera preview' : connection}
          </p>
        )}
        {!observer && (
          <aside className={`w-[40vw] max-w-60 overflow-hidden rounded-lg border border-white/20 bg-[#161319] shadow-lg ${practicing ? 'relative col-start-2 row-start-1' : 'absolute top-4 left-1/2 -translate-x-1/2'}`} aria-label="Your camera">
            <video ref={video} autoPlay muted playsInline aria-label="Your camera preview" className={`aspect-[4/3] w-full -scale-x-100 object-cover ${camera === 'on' ? 'block' : 'hidden'}`} />
            {camera === 'on' && trackedFace && (
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 size-full -scale-x-100"
                viewBox={`0 0 ${trackedFace.frameWidth} ${trackedFace.frameHeight}`}
                preserveAspectRatio="xMidYMid slice"
              >
                <rect
                  x={trackedFace.headBox.originX}
                  y={trackedFace.headBox.originY}
                  width={trackedFace.headBox.width}
                  height={trackedFace.headBox.height}
                  fill="none"
                  stroke={guideOnTarget ? '#4ade80' : '#ffffff'}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
            {camera === 'on' && (
              <div className="pointer-events-none absolute inset-0">
                <div
                  aria-hidden="true"
                  className={`absolute inset-y-2 left-1/2 -translate-x-1/2 border-l border-dashed drop-shadow-[0_0_2px_black] ${guideOnTarget ? 'border-emerald-300' : 'border-white'}`}
                />
                <div role={practicing ? 'status' : undefined}>
                  {cameraPrompt && (
                    <p className="absolute inset-x-1 bottom-1 rounded bg-black/80 px-2 py-1 text-center text-sm font-medium tabular-nums sm:text-base">{cameraPrompt}</p>
                  )}
                </div>
              </div>
            )}
            {camera !== 'on' && (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-2 text-center">
                {cameraError && <p role="alert" className="text-sm">{cameraError}</p>}
                {camera === 'starting' ? <p role="status" className="text-sm">Starting camera…</p> : (
                  <Button size="sm" onClick={() => { setCameraError(''); setCamera('starting') }}>Enable camera</Button>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
      {practicing && !practicePose && (
        <div className="absolute inset-0 grid place-items-center bg-black/65">
          <Button size="lg" className="scale-200" onClick={() => setJoined(true)}>
            Start the test
          </Button>
        </div>
      )}
    </main>
  )
}
