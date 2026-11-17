import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/Screen'
import { DebugOverlay } from '@/components/DebugOverlay'
import { Calibration } from '@/components/participant/Calibration'
import { DoneScreen } from '@/components/participant/DoneScreen'
import { FinalQuestions } from '@/components/participant/FinalQuestions'
import { LikertSurvey } from '@/components/participant/LikertSurvey'
import { RoundStage } from '@/components/participant/RoundStage'
import { StartScreen } from '@/components/participant/StartScreen'
import { URL_PARAMS } from '@/config'
import type { Phase } from '@/data/live'
import { StudySession } from '@/twin/StudySession'

/**
 * Start → mic calibration → (ready → round → round done → survey) × 2 → final questions → done.
 */
export function ParticipantApp() {
  const [session] = useState(() => new StudySession())
  const [phase, setPhaseState] = useState<Phase>('start')
  const [round, setRound] = useState<1 | 2>(1)
  const [ending, setEnding] = useState(false)

  const setPhase = useCallback(
    (next: Phase) => {
      session.setPhase(next)
      setPhaseState(next)
      window.scrollTo(0, 0)
    },
    [session],
  )

  const startRound = () => {
    setEnding(false)
    session.startRound(round, () => setEnding(true))
    setPhase('round')
  }

  const onFadedOut = useCallback(() => setPhase('round-done'), [setPhase])

  const content = (() => {
    switch (phase) {
      case 'start':
        return (
          <StartScreen
            onStart={async (name) => {
              await session.begin(name)
              setPhase('calibrate')
            }}
          />
        )
      case 'calibrate':
        return (
          <Calibration
            mic={session.mic}
            onDone={(calibration) => {
              session.saveCalibration(calibration)
              setPhase('between')
            }}
          />
        )
      case 'between':
        return (
          <Screen
            title={round === 1 ? 'Ready when you are' : 'Part 2 of 2'}
            description={
              round === 1
                ? 'When you press Begin, an object will appear for about 10 minutes.'
                : 'Next, a different object will appear for about 10 minutes.'
            }
          >
            <Button size="lg" className="self-start" onClick={startRound}>
              Begin
            </Button>
          </Screen>
        )
      case 'round':
        return (
          <RoundStage
            key={round}
            session={session}
            form={session.forms[round - 1]}
            ending={ending}
            onFadedOut={onFadedOut}
          />
        )
      case 'round-done':
        return (
          <Screen title="Round complete" description="Please wait for the researcher.">
            <Button size="lg" className="self-start" onClick={() => setPhase('survey')}>
              Continue to questions
            </Button>
          </Screen>
        )
      case 'survey':
        return (
          <LikertSurvey
            key={round}
            part={round}
            imaginedPerson={session.imaginedPerson}
            onSubmit={(values) => {
              session.submitAnswers(round, session.forms[round - 1], values)
              if (round === 1) {
                setRound(2)
                setPhase('between')
              } else {
                session.stopMic()
                setPhase('final')
              }
            }}
          />
        )
      case 'final':
        return (
          <FinalQuestions
            forms={session.forms}
            onSubmit={(values) => {
              session.submitAnswers(0, null, values)
              setPhase('done')
            }}
          />
        )
      case 'done':
        return <DoneScreen session={session} />
    }
  })()

  return (
    <>
      {content}
      {URL_PARAMS.debug && phase !== 'round' && <DebugOverlay session={session} scene={null} />}
    </>
  )
}
