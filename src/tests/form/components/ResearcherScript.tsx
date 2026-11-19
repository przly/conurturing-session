import { useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { ROUND_CONFIG } from '@/config'
import type { LiveStatus } from '@/shared/data/live'
import { currentStepIds, nextStep, RESEARCHER_SCRIPT, type ScriptStep } from '@/tests/form/researcherScript'
import { cn } from '@/lib/utils'

interface ResearcherScriptProps {
  /** Last status received from the participant page (may be stale), or null if never connected. */
  status: LiveStatus | null
  connected: boolean
  steps?: ScriptStep[]
  describeStatus?: (status: LiveStatus) => string
  getNextStep?: (stepId: string, round: number | null) => ScriptStep | null
}

/** Steps to read before the participant page has connected. */
const BEFORE_START = ['welcome', 'concept']

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

function describe(status: LiveStatus): string {
  const r = status.round
  switch (status.phase) {
    case 'start':
      return 'Start screen'
    case 'calibrate':
      return 'Microphone check'
    case 'between':
      return `Ready screen, before round ${r ? r + 1 : 1}`
    case 'round':
      return `Round ${r} · ${status.form} · ${fmtTime(status.t ?? 0)} / ${fmtTime(ROUND_CONFIG.durationSec)}`
    case 'round-done':
      return `Round ${r} complete`
    case 'survey':
      return `Questions after round ${r}`
    case 'final':
      return 'Last questions'
    case 'done':
      return 'Thank you screen'
    case 'intro':
    case 'check':
      return status.phase // weather-test phases; never sent by the form test
  }
}

/**
 * Follows the participant: shows what to read aloud right now, previews
 * the next step, and keeps the full script one click away.
 */
export function ResearcherScript({
  status, connected, steps = RESEARCHER_SCRIPT, describeStatus = describe, getNextStep = nextStep,
}: ResearcherScriptProps) {
  const [showAll, setShowAll] = useState(false)

  const currentIds = !status
    ? BEFORE_START
    : steps === RESEARCHER_SCRIPT
      ? currentStepIds(status.phase, status.round)
      : steps.filter((step) => step.match?.phases.includes(status.phase)).map((step) => step.id)
  const current = steps.filter((step) => currentIds.includes(step.id))
  const next = current.length ? getNextStep(current[current.length - 1].id, status?.round ?? null) : null

  return (
    <div className="flex flex-col gap-3">
      <Card className="border-primary/40">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">Read now</CardTitle>
            {!status ? (
              <Badge variant="outline">waiting for participant page</Badge>
            ) : connected ? (
              <Badge variant="success">live</Badge>
            ) : (
              <Badge variant="warning">connection lost: last known screen</Badge>
            )}
          </div>
          <CardDescription>
            {status
              ? `Participant is on: ${describeStatus(status)}`
              : 'Open the participant link on their laptop. Start with this when they sit down.'}
          </CardDescription>
        </CardHeader>
        <CardPanel className="flex flex-col gap-6">
          {current.map((step) => (
            <StepBody key={step.id} step={step} size="large" />
          ))}
        </CardPanel>
        {next && (
          <CardFooter className="flex-col items-start gap-0.5 text-sm">
            <span className="text-muted-foreground">Next</span>
            <span>
              <span className="font-medium">{next.title}</span>{' '}
              <span className="text-muted-foreground">· {next.when}</span>
            </span>
          </CardFooter>
        )}
      </Card>

      <Card>
        <CardHeader>
          <button
            type="button"
            onClick={() => setShowAll((open) => !open)}
            aria-expanded={showAll}
            className="flex w-full items-center justify-between gap-4 text-left"
          >
            <CardTitle className="text-base">Full script</CardTitle>
            <ChevronDownIcon
              aria-hidden="true"
              className={cn('size-5 shrink-0 text-muted-foreground transition-transform', showAll && 'rotate-180')}
            />
          </button>
        </CardHeader>
        {showAll && (
          <CardPanel>
            <ol className="flex flex-col gap-3">
              {steps.map((step, index) => {
                const isCurrent = currentIds.includes(step.id)
                return (
                  <li
                    key={step.id}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={cn('rounded-xl border p-4', isCurrent && 'border-primary/60 bg-accent')}
                  >
                    <StepBody step={step} number={index + 1} current={isCurrent} />
                  </li>
                )
              })}
            </ol>
          </CardPanel>
        )}
      </Card>
    </div>
  )
}

function StepBody({
  step,
  number,
  current,
  size = 'normal',
}: {
  step: ScriptStep
  number?: number
  current?: boolean
  size?: 'normal' | 'large'
}) {
  const large = size === 'large'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className={cn('font-semibold', large && 'text-lg')}>
          {number !== undefined && <span className="text-muted-foreground tabular-nums">{number}. </span>}
          {step.title}
        </h3>
        <span className="text-muted-foreground text-sm">{step.when}</span>
        {current && (
          <Badge variant="success" className="ms-auto">
            Now
          </Badge>
        )}
      </div>
      {step.say.length > 0 ? (
        <div
          className={cn(
            'flex flex-col border-primary/40 border-s-2 ps-4',
            large ? 'gap-3 text-lg leading-relaxed sm:text-xl' : 'gap-2 text-base leading-relaxed',
          )}
        >
          {step.say.map((line, i) => (
            <p key={i} className="text-pretty">
              {line}
            </p>
          ))}
        </div>
      ) : (
        large && <p className="text-muted-foreground">Nothing to read aloud.</p>
      )}
      {step.notes && (
        <ul
          className={cn(
            'flex list-disc flex-col gap-1 ps-5 text-muted-foreground italic',
            large ? 'text-base' : 'text-sm',
          )}
        >
          {step.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
