import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { URL_PARAMS, WEATHER_CONFIG, type SessionConfig } from '@/config'
import { DoneScreen } from '@/shared/components/DoneScreen'
import { LikertSurvey } from '@/shared/components/LikertSurvey'
import { Screen } from '@/shared/components/Screen'
import type { Phase } from '@/shared/data/live'
import { SCALE_HINT } from '@/shared/survey/likert'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ComprehensionCheck } from './components/ComprehensionCheck'
import { FinalQuestions } from './components/FinalQuestions'
import { HomeCircles } from './components/HomeCircles'
import { IntroScreen } from './components/IntroScreen'
import { loadPresence, type CueTrack } from './presence/CueTrack'
import { ConditionStage } from './components/ConditionStage'
import { StartScreen } from './components/StartScreen'
import { WeatherDebugPanel } from './components/WeatherDebugPanel'
import { framing, likertItems, STUDY_TEXT as copy } from './text'
import { WeatherSession, type PreparedWeather } from './WeatherSession'

interface WeatherTestProps {
  /** Null for a local preview (`?test=weather`): nothing is saved. */
  sessionId: string | null
  config: SessionConfig
}

/**
 * Start → intro clip → comprehension check →
 * (framing → condition → survey) × 2–3 → final questions → done.
 * No microphone; during a condition the participant only watches.
 */
export function WeatherTest({ sessionId, config }: WeatherTestProps) {
  const [session] = useState(() => new WeatherSession(sessionId, config))
  const [phase, setPhaseState] = useState<Phase>('start')
  /** 1-based position of the next / current condition. */
  const [position, setPosition] = useState(1)
  const [ending, setEnding] = useState(false)
  const [prepared, setPrepared] = useState<{ position: number; weather: PreparedWeather | null; track: CueTrack } | null>(null)
  const [mediaError, setMediaError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [starting, setStarting] = useState(false)
  const assets = useRef<AbortController | null>(null)
  const [replay, setReplay] = useState(0)
  const attempts = useRef(0)
  const [options] = useState(() => {
    const shuffled = [...copy.checkOptions]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const option = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = option
    }
    return shuffled
  })

  useEffect(() => {
    session.connect()
    return () => {
      assets.current?.abort()
      session.dispose()
    }
  }, [session])

  const setPhase = useCallback(
    (next: Phase) => {
      session.setPhase(next)
      setPhaseState(next)
      window.scrollTo(0, 0)
    },
    [session],
  )

  const total = session.conditions.length
  const condition = session.conditionAt(position)!

  // Keep the prepared video alive through the condition, then release it.
  useEffect(() => {
    if (phase !== 'between') return
    assets.current?.abort()
    const controller = new AbortController()
    assets.current = controller
    void Promise.all([
      session.prepareWeather(position),
      loadPresence(session.clipAt(position), session.clipOffsetAt(position), controller.signal),
    ]).then(([weather, track]) => {
      if (!controller.signal.aborted) setPrepared({ position, weather, track })
    }).catch(() => {
      if (!controller.signal.aborted) setMediaError(true)
    })
  }, [session, phase, position, retry])

  const ready = prepared?.position === position

  const startCondition = async () => {
    if (!ready || starting) return
    setStarting(true)
    try {
      await prepared.track.video.play()
      setEnding(false)
      session.startCondition(position, () => setEnding(true), prepared.weather, prepared.track)
      setPhase('round')
    } catch {
      setMediaError(true)
    } finally {
      setStarting(false)
    }
  }

  const onFadedOut = useCallback(() => {
    assets.current?.abort()
    setPhase('survey')
  }, [setPhase])

  const content = (() => {
    switch (phase) {
      case 'start':
        return (
          <StartScreen
            onStart={async (details) => {
              await session.begin(details)
              setPhase('intro')
            }}
          />
        )
      case 'intro':
        return (
          <IntroScreen
            onStart={() => session.log('intro_start', { round: 0, meta: { replay, watched_sec: 0 } })}
            onEnd={(watchedSec) => session.log('intro_end', { round: 0, meta: { replay, watched_sec: watchedSec } })}
            onContinue={() => setPhase('check')}
          />
        )
      case 'check':
        return (
          <ComprehensionCheck
            options={options}
            onAnswer={(answer, correct) => session.log('comprehension_answer', {
              round: 0,
              meta: { answer, correct, attempt: ++attempts.current, shown_order: options.map((option) => option.id) },
            })}
            onReplay={() => { setReplay(replay + 1); setPhase('intro') }}
            onContinue={() => setPhase('between')}
          />
        )
      case 'between':
        return (
          <Screen title={copy.part(position, total)}>
            <div className="flex flex-col gap-2 text-pretty text-lg">
              {framing(condition, session.personal).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <p className="text-muted-foreground">{copy.watch(Math.round(WEATHER_CONFIG.conditionSec / 60))}</p>
            {mediaError ? (
              <>
                <Alert variant="error"><AlertDescription>{copy.presenceError}</AlertDescription></Alert>
                <Button className="self-start" onClick={() => {
                  setPrepared(null)
                  setMediaError(false)
                  setRetry(retry + 1)
                }}>{copy.retry}</Button>
              </>
            ) : (
              <Button size="lg" className="self-start" onClick={startCondition} loading={!ready || starting}>{copy.begin}</Button>
            )}
          </Screen>
        )
      case 'round':
        return <ConditionStage key={position} session={session} ending={ending} onFadedOut={onFadedOut} />
      case 'survey':
        return (
          <LikertSurvey
            key={position}
            title={copy.surveyTitle(position)}
            description={`${copy.surveyDescription} ${SCALE_HINT}`}
            items={[...likertItems(session.personal), { id: 'ios', text: copy.ios }]}
            pictureItem={{ id: 'ios', render: (point) => <HomeCircles point={point} />, label: copy.iosLabel, missingMessage: copy.missing }}
            onSubmit={(values) => {
              session.submitAnswers(position, condition, values)
              if (position < total) {
                setPosition(position + 1)
                setPhase('between')
              } else {
                setPhase('final')
              }
            }}
          />
        )
      case 'final':
        return <FinalQuestions conditions={session.conditions} onSubmit={(values) => {
          session.submitAnswers(0, null, values)
          setPhase('done')
        }} />
      case 'done':
        return (
          <DoneScreen
            logger={session.logger}
            sessionId={session.id}
            details={{
              test_type: 'weather',
              preview: session.preview,
              condition_order: session.conditions.join(','),
              clip_assignment: session.config.clip_assignment?.join(',') ?? null,
              hometown: session.personal.hometown,
              hometown_coords: session.hometownCoords,
              family_name: session.personal.familyName,
            }}
          />
        )
      case 'calibrate':
      case 'round-done':
        return null // form-test phases
    }
  })()

  return (
    <>
      {content}
      {URL_PARAMS.debug && phase !== 'round' && <WeatherDebugPanel weather={session.weather} session={session} scene={null} />}
    </>
  )
}
