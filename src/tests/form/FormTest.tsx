import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Screen } from '@/shared/components/Screen'
import { DebugOverlay } from '@/tests/form/components/DebugOverlay'
import { Calibration } from '@/tests/form/components/Calibration'
import { DoneScreen } from '@/shared/components/DoneScreen'
import { FinalQuestions } from '@/tests/form/components/FinalQuestions'
import { LikertSurvey } from '@/shared/components/LikertSurvey'
import { SCALE_HINT } from '@/shared/survey/likert'
import { RoundStage } from '@/tests/form/components/RoundStage'
import { StartScreen } from '@/tests/form/components/StartScreen'
import { ROUND_MINUTES, URL_PARAMS } from '@/config'
import type { Phase } from '@/shared/data/live'
import { LIKERT_ITEMS } from '@/tests/form/questions'
import { StudySession } from '@/tests/form/StudySession'

/**
 * Start → mic calibration → (ready → round → round done → survey) × 2 → final questions → done.
 */
export function FormTest() {
  const [session] = useState(() => new StudySession())
  const [phase, setPhaseState] = useState<Phase>('start')
  const [round, setRound] = useState<1 | 2>(1)
  const [ending, setEnding] = useState(false)

  // Connect to the admin panel right away (only for links made there), so the script can follow from the start.
  useEffect(() => {
    if (URL_PARAMS.session) session.connect()
  }, [session])

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
                ? `When you press Begin, an object will appear for about ${ROUND_MINUTES} minutes.`
                : `Next, a different object will appear for about ${ROUND_MINUTES} minutes.`
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
            title={`Questions about object ${round}`}
            description={`Think about the object you just spent time with. How much do you agree with each statement? ${SCALE_HINT}`}
            items={LIKERT_ITEMS.map((item) => ({ id: item.id, text: item.text(session.imaginedPerson) }))}
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
        return (
          <DoneScreen
            logger={session.logger}
            sessionId={session.id}
            details={{ order: session.order, imagined_person: session.imaginedPerson }}
          />
        )
    }
  })()

  return (
    <>
      {content}
      {URL_PARAMS.debug && phase !== 'round' && <DebugOverlay session={session} scene={null} />}
    </>
  )
}
