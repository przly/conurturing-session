import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { WEATHER_CONFIG } from '@/config'
import { DoneScreen } from '@/shared/components/DoneScreen'
import { Screen } from '@/shared/components/Screen'
import { ConditionStage } from './components/ConditionStage'
import { loadRecordedPresence, type CueTrack } from './presence/CueTrack'
import { WeatherSession } from './WeatherSession'

export function PresenceTest() {
  const [session] = useState(() => new WeatherSession(null, {
    test_type: 'weather',
    order_ab: null,
    condition_order: ['A', 'A'],
    clip_assignment: [1, 1],
    clip3_offset_sec: 0,
    include_c: false,
  }))
  const [position, setPosition] = useState(1)
  const [phase, setPhase] = useState<'ready' | 'viewing' | 'question' | 'done'>('ready')
  const [ending, setEnding] = useState(false)
  const [track, setTrack] = useState<CueTrack | null>(null)
  const [starting, setStarting] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [answer, setAnswer] = useState('')
  const assets = useRef<AbortController | null>(null)

  useEffect(() => () => session.dispose(), [session])

  useEffect(() => {
    const controller = new AbortController()
    assets.current = controller
    void loadRecordedPresence(controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setTrack(loaded)
    }).catch(() => {
      if (!controller.signal.aborted) setMediaError(true)
    })
    return () => controller.abort()
  }, [session, position, retry])

  const begin = async () => {
    const signal = assets.current?.signal
    if (!track || starting || !signal || signal.aborted) return
    setStarting(true)
    try {
      await track.video.play()
      if (signal.aborted) return
      setEnding(false)
      session.startCondition(position, () => setEnding(true), null, track)
      setPhase('viewing')
    } catch {
      if (!signal.aborted) setMediaError(true)
    } finally {
      if (!signal.aborted) setStarting(false)
    }
  }

  const finishViewing = useCallback(() => {
    assets.current?.abort()
    setTrack(null)
    setPhase('question')
  }, [])

  if (phase === 'viewing') {
    return <ConditionStage session={session} hideBackdrop={position === 2} ending={ending} onFadedOut={finishViewing} />
  }

  if (phase === 'question') {
    return (
      <Screen title={`After viewing ${position}`}>
        <form className="flex flex-col items-start gap-4" onSubmit={(event) => {
          event.preventDefault()
          const response = answer.trim()
          if (!response) return
          session.submitAnswers(position, null, { movement_attribution: response })
          setAnswer('')
          if (position === 1) {
            setPosition(2)
            setPhase('ready')
          } else {
            setPhase('done')
          }
        }}>
          <label htmlFor="movement-attribution">What, if anything, do you think caused the flower to move?</label>
          <Textarea id="movement-attribution" className="w-full" value={answer} onChange={(event) => setAnswer(event.target.value)} required />
          <Button type="submit" disabled={!answer.trim()}>{position === 1 ? 'Continue' : 'Finish'}</Button>
        </form>
      </Screen>
    )
  }

  if (phase === 'done') {
    return <DoneScreen
      logger={session.logger}
      sessionId={session.id}
      details={{ test_type: 'presence', backdrop_order: ['visible', 'hidden'], clip: 1, recording: WEATHER_CONFIG.presence.recording, viewing_duration_sec: WEATHER_CONFIG.conditionSec }}
    />
  }

  return (
    <Screen title={`Viewing ${position} of 2`} description="Watch the flower for up to one minute. You’ll answer a question afterward.">
      {mediaError ? (
        <>
          <p role="alert">The viewing could not load.</p>
          <Button className="self-start" onClick={() => {
            setTrack(null)
            setMediaError(false)
            setRetry((attempt) => attempt + 1)
          }}>Try again</Button>
        </>
      ) : (
        <Button className="self-start" onClick={begin} loading={!track || starting}>Begin</Button>
      )}
    </Screen>
  )
}
