import { useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import type { LiveStatus } from '@/data/live'
import { currentStepIds, RESEARCHER_SCRIPT } from '@/survey/researcherScript'
import { cn } from '@/lib/utils'

/** Read-aloud script; highlights the step that matches the live participant screen. */
export function ResearcherScript({ live }: { live: LiveStatus | null }) {
  const [open, setOpen] = useState(true)
  const current = live ? currentStepIds(live.phase, live.round) : []

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-start justify-between gap-4 text-left"
        >
          <div className="flex flex-col gap-1">
            <CardTitle>Script to read aloud</CardTitle>
            <CardDescription>
              {live
                ? 'The highlighted step matches the participant’s screen right now.'
                : 'Select a live session to highlight the current step.'}{' '}
              <span className="italic">Italic notes are for you only.</span>
            </CardDescription>
          </div>
          <ChevronDownIcon
            aria-hidden="true"
            className={cn('mt-1 size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </button>
      </CardHeader>
      {open && (
        <CardPanel>
          <ol className="flex flex-col gap-3">
            {RESEARCHER_SCRIPT.map((step, index) => {
              const isCurrent = current.includes(step.id)
              return (
                <li
                  key={step.id}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'flex flex-col gap-3 rounded-xl border p-4',
                    isCurrent && 'border-primary/60 bg-accent',
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-semibold">
                      <span className="text-muted-foreground tabular-nums">{index + 1}.</span> {step.title}
                    </h3>
                    <span className="text-muted-foreground text-sm">{step.when}</span>
                    {isCurrent && (
                      <Badge variant="success" className="ms-auto">
                        Now
                      </Badge>
                    )}
                  </div>
                  {step.say.length > 0 && (
                    <div className="flex flex-col gap-2 border-primary/30 border-s-2 ps-3 text-base leading-relaxed">
                      {step.say.map((line, i) => (
                        <p key={i} className="text-pretty">
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                  {step.notes && (
                    <ul className="flex list-disc flex-col gap-1 ps-5 text-muted-foreground text-sm italic">
                      {step.notes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ol>
        </CardPanel>
      )}
    </Card>
  )
}
