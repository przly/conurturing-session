import { useEffect, useRef, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, RotateCcwIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardFooter, CardPanel } from '@/components/ui/card'
import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack } from '@/components/ui/progress'
import { QuestionStep } from '@/components/QuestionStep'
import { survey, type OptionKey } from '@/survey/surveyContent'
import { createResponseId, submitResponse } from '@/survey/submit'

type Answers = Record<string, OptionKey>

export default function App() {
  const { questions } = survey
  const total = questions.length
  const [step, setStep] = useState(0) // 0..total-1 = questions, total = done
  const [answers, setAnswers] = useState<Answers>({})
  const [hasNavigated, setHasNavigated] = useState(false)
  // One id per run through the survey; re-submitting after "Back" updates the same row.
  const [responseId, setResponseId] = useState(createResponseId)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const isDone = step >= total
  const question = questions[step]
  const answer = question ? answers[question.id] : undefined
  const isLast = step === total - 1

  const go = (next: number) => {
    setHasNavigated(true)
    setSubmitError(null)
    setStep(next)
  }

  const restart = () => {
    setAnswers({})
    setResponseId(createResponseId())
    go(0)
  }

  const finish = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitResponse({ response_id: responseId, survey_version: survey.version, answers })
      go(total)
    } catch (error) {
      console.error(error)
      setSubmitError('Your answers could not be saved. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-background text-foreground">
        <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-8 sm:px-6 sm:py-12">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">{survey.title}</h1>
            <p className="text-pretty text-muted-foreground">{survey.intro}</p>
          </div>

          <Card>
            {isDone ? (
              <Completion answers={answers} onRestart={restart} onReview={() => go(total - 1)} />
            ) : (
              <>
                <CardPanel className="flex flex-col gap-6">
                  <Progress value={step + 1} max={total} getAriaValueText={() => `Question ${step + 1} of ${total}`}>
                    <div className="flex items-center justify-between text-sm">
                      <ProgressLabel className="tabular-nums">
                        Question {step + 1} of {total}
                      </ProgressLabel>
                      <span className="text-muted-foreground tabular-nums">
                        {Object.keys(answers).length} answered
                      </span>
                    </div>
                    <ProgressTrack>
                      <ProgressIndicator />
                    </ProgressTrack>
                  </Progress>

                  <QuestionStep
                    question={question}
                    answer={answer}
                    focusHeading={hasNavigated}
                    onAnswer={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
                  />
                  {submitError && (
                    <Alert variant="error">
                      <AlertTitle>Not saved yet</AlertTitle>
                      <AlertDescription>{submitError}</AlertDescription>
                    </Alert>
                  )}
                </CardPanel>

                <CardFooter className="flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={step === 0 || submitting}
                    onClick={() => go(step - 1)}
                  >
                    <ArrowLeftIcon aria-hidden="true" />
                    Back
                  </Button>
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                    {!answer && (
                      <p className="text-center text-muted-foreground text-sm" id="next-hint">
                        Choose an answer to continue
                      </p>
                    )}
                    <Button
                      className="w-full sm:w-auto"
                      disabled={!answer}
                      loading={submitting}
                      aria-describedby={!answer ? 'next-hint' : undefined}
                      onClick={() => (isLast ? finish() : go(step + 1))}
                    >
                      {isLast ? (submitError ? 'Try again' : 'Finish') : 'Next'}
                      {isLast ? <CheckIcon aria-hidden="true" /> : <ArrowRightIcon aria-hidden="true" />}
                    </Button>
                  </div>
                </CardFooter>
              </>
            )}
          </Card>
        </main>
      </div>
    </MotionConfig>
  )
}

interface CompletionProps {
  answers: Answers
  onRestart: () => void
  onReview: () => void
}

function Completion({ answers, onRestart, onReview }: CompletionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])

  return (
    <>
      <CardPanel className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="flex size-10 items-center justify-center rounded-full bg-success/12 text-success-foreground">
            <CheckIcon aria-hidden="true" className="size-5" />
          </span>
          <h2
            tabIndex={-1}
            ref={headingRef}
            className="font-semibold text-xl tracking-tight outline-none sm:text-2xl"
          >
            Thank you for taking part
          </h2>
          <p className="text-muted-foreground">Your answers have been saved. Here is a summary.</p>
        </div>

        <ol className="flex flex-col divide-y rounded-xl border">
          {survey.questions.map((q, i) => {
            const key = answers[q.id]
            return (
              <li key={q.id} className="flex flex-col gap-1 p-4">
                <span className="text-muted-foreground text-sm">
                  {i + 1}. {q.prompt}
                </span>
                <span className="font-medium">{key ? `${key}. ${q.options[key]}` : 'No answer'}</span>
              </li>
            )
          })}
        </ol>
      </CardPanel>
      <CardFooter className="flex-col-reverse items-stretch gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" className="w-full sm:w-auto" onClick={onReview}>
          <ArrowLeftIcon aria-hidden="true" />
          Back to last question
        </Button>
        <Button variant="outline" className="w-full sm:w-auto" onClick={onRestart}>
          <RotateCcwIcon aria-hidden="true" />
          Start again
        </Button>
      </CardFooter>
    </>
  )
}
