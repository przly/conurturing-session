import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TwinCanvas } from '@/shared/components/TwinCanvas'
import { supabase } from '@/shared/data/supabase'
import type { TwinState } from '@/shared/scene/state'
import { startFaceTracking } from './faceTracking'

type Seat = 'a' | 'b'
const SIGNAL_INTERVAL = 250
const SIGNAL_TIMEOUT = 2000

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
  const video = useRef<HTMLVideoElement>(null)
  const localFace = useRef(false)
  const partner = useRef({ present: false, received: -Infinity })
  const [connection, setConnection] = useState(supabase ? 'Connecting flowers…' : 'Set up the Supabase connection to pair flowers.')
  const [camera, setCamera] = useState<'off' | 'starting' | 'on'>('off')
  const [cameraError, setCameraError] = useState('')
  const bloom = useRef({ openness: 0, updated: 0 })

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    let subscribed = false
    const connect = () => client.channel(`flower-pair-${room}`)
      .on('broadcast', { event: 'face' }, ({ payload }) => {
        if (!active || payload?.seat !== (seat === 'a' ? 'b' : 'a') || typeof payload.present !== 'boolean') return
        partner.current = { present: payload.present, received: performance.now() }
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
      void channel?.send({ type: 'broadcast', event: 'face', payload: { seat, present: localFace.current && !document.hidden } })
    }, SIGNAL_INTERVAL)
    return () => {
      active = false
      window.clearTimeout(join)
      window.clearInterval(timer)
      partner.current.received = -Infinity
      if (channel) void client.removeChannel(channel)
    }
  }, [room, seat])

  const cameraRequested = camera !== 'off'
  useEffect(() => {
    if (!cameraRequested || !video.current) return
    const controller = new AbortController()
    startFaceTracking(video.current, controller.signal, (present) => {
      localFace.current = present
      setCamera('on')
    }, (message) => {
      localFace.current = false
      setCameraError(message)
      setCamera('off')
    })
    return () => {
      localFace.current = false
      controller.abort()
    }
  }, [cameraRequested])

  const readFlower = (): TwinState => {
    const now = performance.now()
    const { present, received } = partner.current
    const target = present && now - received <= SIGNAL_TIMEOUT ? 1 : 0
    const { openness, updated } = bloom.current
    const next = target + (openness - target) * Math.exp(-Math.min(now - updated, 100) / 400)
    bloom.current = { openness: next, updated: now }
    return { health: 0.75, pulse: 0, listening: false, voice: 0, headOpenness: next }
  }

  return (
    <main className="fixed inset-0 bg-[#0d0e11] text-[#f5f1f8]" aria-label={`Flower ${seat.toUpperCase()}`}>
      <TwinCanvas form="plant" getState={readFlower} />
      {connection && <p role="status" className="absolute top-4 left-4 rounded-md bg-black/75 px-3 py-2 text-sm">{connection}</p>}
      <aside className="absolute right-4 bottom-4 w-36 overflow-hidden rounded-lg border border-white/20 bg-[#161319] shadow-lg sm:w-48" aria-label="Your camera">
        <video ref={video} autoPlay muted playsInline aria-label="Your camera preview" className={`aspect-[4/3] w-full -scale-x-100 object-cover ${camera === 'on' ? 'block' : 'hidden'}`} />
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
