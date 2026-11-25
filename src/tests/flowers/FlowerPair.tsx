import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { WEATHER_CONFIG } from '@/config'
import { TwinCanvas } from '@/shared/components/TwinCanvas'
import { supabase } from '@/shared/data/supabase'
import type { TwinState } from '@/shared/scene/state'
import { startFaceTracking, type TrackedFace } from './faceTracking'

type Seat = 'a' | 'b'
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

export default function FlowerPair() {
  const params = new URLSearchParams(window.location.search)
  const room = params.get('room')
  const seat = params.get('seat')

  if (room && /^[a-zA-Z0-9_-]{8,80}$/.test(room) && (seat === 'a' || seat === 'b')) {
    return <FlowerStage room={room} seat={seat} />
  }
  return <PairSetup />
}

function PairSetup() {
  const [room] = useState(() => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(''))
  const link = (seat: Seat) => `?test=flowers&room=${room}&seat=${seat}`

  return (
    <main className="grid min-h-dvh place-items-center bg-[#0d0e11] p-6 text-[#f5f1f8]">
      <div className="w-full max-w-sm space-y-5">
        <h1 className="text-3xl font-medium">Twin flowers</h1>
        {supabase ? (
          <>
            <p className="text-[#ccc5d1]">Open Flower A here and share the Flower B link with your partner.</p>
            <div className="flex flex-wrap gap-3">
              <a className="rounded-md bg-[#eee4f7] px-4 py-2 text-[#17111c]" href={link('a')}>Open Flower A</a>
              <a className="rounded-md border border-[#8e8198] px-4 py-2" href={link('b')}>Flower B link</a>
            </div>
            <input className="w-full rounded-md border border-[#8e8198] bg-transparent p-2 text-sm" aria-label="Shareable Flower B link" readOnly value={new URL(link('b'), window.location.href).href} onFocus={(event) => event.currentTarget.select()} />
          </>
        ) : <p role="status">Set up the project’s Supabase connection to create a flower pair.</p>}
      </div>
    </main>
  )
}

function FlowerStage({ room, seat }: { room: string; seat: Seat }) {
  const selfPreview = import.meta.env.DEV && room === 'local-flower-preview'
  const video = useRef<HTMLVideoElement>(null)
  const localFace = useRef<TrackedFace | null>(null)
  const partner = useRef({ openness: 0, glow: 0, received: -Infinity })
  const [connection, setConnection] = useState(supabase ? 'Connecting flowers…' : 'Set up the Supabase connection to pair flowers.')
  const [camera, setCamera] = useState<'off' | 'starting' | 'on'>('off')
  const [trackedFace, setTrackedFace] = useState<TrackedFace | null>(null)
  const [cameraError, setCameraError] = useState('')
  const bloom = useRef({ openness: 0, glow: 0, updated: 0 })

  useEffect(() => {
    if (selfPreview) return
    const client = supabase
    if (!client) return
    let active = true
    let subscribed = false
    const connect = () => client.channel(`flower-pair-${room}`)
      .on('broadcast', { event: 'face' }, ({ payload }) => {
        if (!active || payload?.seat !== (seat === 'a' ? 'b' : 'a') || typeof payload.present !== 'boolean') return
        const openness = Number.isFinite(payload.openness)
          ? Math.min(MAX_PETAL_OPENNESS, Math.max(0, payload.openness))
          : Number(payload.present)
        const glow = Number.isFinite(payload.glow) ? Math.min(1, Math.max(0, payload.glow)) : Math.min(1, openness)
        partner.current = { openness, glow, received: performance.now() }
        setConnection('')
      })
      .subscribe((status) => {
        if (!active) return
        subscribed = status === 'SUBSCRIBED'
        if (!subscribed) partner.current.received = -Infinity
        setConnection(subscribed ? 'Waiting for the other flower…' : 'Reconnecting flowers…')
      })

    // Delay the join until after React's development-only effect replay.
    let channel: ReturnType<typeof connect> | undefined
    const join = window.setTimeout(() => { channel = connect() }, 0)
    const timer = window.setInterval(() => {
      if (!subscribed) return
      if (performance.now() - partner.current.received > SIGNAL_TIMEOUT) setConnection('Waiting for the other flower…')
      const face = document.hidden ? null : localFace.current
      void channel?.send({
        type: 'broadcast',
        event: 'face',
        payload: { seat, present: face !== null, openness: opennessFor(face), glow: glowFor(face?.size ?? 0) },
      })
    }, SIGNAL_INTERVAL)
    return () => {
      active = false
      window.clearTimeout(join)
      window.clearInterval(timer)
      partner.current.received = -Infinity
      if (channel) void client.removeChannel(channel)
    }
  }, [room, seat, selfPreview])

  const cameraRequested = camera !== 'off'
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
      setCameraError(message)
      setCamera('off')
    })
    return () => {
      localFace.current = null
      controller.abort()
    }
  }, [cameraRequested])

  const readFlower = (): TwinState => {
    const now = performance.now()
    const { openness: partnerOpenness, glow: partnerGlow, received } = partner.current
    const connected = now - received <= SIGNAL_TIMEOUT
    const targetOpenness = selfPreview ? opennessFor(localFace.current) : connected ? partnerOpenness : 0
    const targetGlow = selfPreview ? glowFor(localFace.current?.size ?? 0) : connected ? partnerGlow : 0
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

  return (
    <main className="fixed inset-0 bg-[#0d0e11] text-[#f5f1f8]" aria-label={`Flower ${seat.toUpperCase()}`}>
      <TwinCanvas
        form="plant"
        getState={readFlower}
        getWeather={studioLook}
        disableFog
        floorDepthRadius={WEATHER_CONFIG.presence.floorDepthRadius}
      />
      {(selfPreview || connection) && (
        <p role="status" className="absolute top-4 left-4 rounded-md bg-black/75 px-3 py-2 text-sm">
          {selfPreview ? 'Local camera preview' : connection}
        </p>
      )}
      <aside className="absolute right-4 bottom-4 w-36 overflow-hidden rounded-lg border border-white/20 bg-[#161319] shadow-lg sm:w-48" aria-label="Your camera">
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
              stroke="#a7f3d0"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {camera === 'on' && (
          <div className="pointer-events-none absolute inset-0">
            <div
              aria-hidden="true"
              className={`absolute inset-y-2 left-1/2 -translate-x-1/2 border-l border-dashed drop-shadow-[0_0_2px_black] ${onTarget ? 'border-emerald-300' : 'border-white'}`}
            />
            <p className="absolute inset-x-1 bottom-1 rounded bg-black/80 px-1 py-0.5 text-center text-xs">
              {onTarget ? 'Full bloom position' : centered ? 'Move closer' : 'Center your face'}
            </p>
          </div>
        )}
        {camera !== 'on' && (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-2 text-center">
            {cameraError && <p role="alert" className="text-xs">{cameraError}</p>}
            {camera === 'starting' ? <p role="status" className="text-xs">Starting camera…</p> : (
              <Button size="sm" onClick={() => { setCameraError(''); setCamera('starting') }}>Enable camera</Button>
            )}
          </div>
        )}
      </aside>
    </main>
  )
}
