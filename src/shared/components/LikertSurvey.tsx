import { useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { Screen } from '@/shared/components/Screen'
import { LIKERT_LABELS, LIKERT_MAX, LIKERT_MIN, SCALE_HINT, type SurveyItem } from '@/shared/survey/likert'
import { cn } from '@/lib/utils'

interface LikertSurveyProps {
  title: string
  /** Defaults to the agreement instruction with the scale ends. */
  description?: string
  /** Statements in display order, text already filled in. */
  items: SurveyItem[]
  pictureItem?: {
    id: string
    render: (point: number) => React.ReactNode
    label: (point: number) => string
    missingMessage: string
  }
  onSubmit: (values: Record<string, string>) => void
}

const POINTS = Array.from({ length: LIKERT_MAX - LIKERT_MIN + 1 }, (_, i) => String(LIKERT_MIN + i))

/** One page of 1–7 agreement statements; all are required. */
export function LikertSurvey({ title, description, items, pictureItem, onSubmit }: LikertSurveyProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [showMissing, setShowMissing] = useState(false)
  const itemRefs = useRef<Record<string, HTMLFieldSetElement | null>>({})

  const missing = items.filter((item) => !values[item.id])

  const submit = () => {
    if (missing.length) {
      setShowMissing(true)
      const first = itemRefs.current[missing[0].id]
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      first?.querySelector<HTMLElement>('[role="radio"]')?.focus({ preventScroll: true })
      return
    }
    onSubmit(values)
  }

  return (
    <Screen
      title={title}
      description={description ?? `How much do you agree with each statement? ${SCALE_HINT}`}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        {items.map((item, index) => {
          const picture = pictureItem?.id === item.id ? pictureItem : undefined
          const invalid = showMissing && !values[item.id]
          const labelId = `likert-${item.id}`
          return (
            <fieldset
              key={item.id}
              ref={(el) => {
                itemRefs.current[item.id] = el
              }}
              className={cn('flex flex-col gap-3 rounded-xl border p-4', invalid && 'border-destructive/48')}
            >
              <legend id={labelId} className="float-left mb-1 w-full font-medium">
                <span className="text-muted-foreground tabular-nums">{index + 1}.</span> {item.text}
              </legend>
              <RadioGroup
                aria-labelledby={labelId}
                aria-invalid={invalid || undefined}
                value={values[item.id] ?? null}
                onValueChange={(value) => setValues((prev) => ({ ...prev, [item.id]: value as string }))}
                className={cn('grid gap-1.5', picture ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-7')}
              >
                {POINTS.map((point) => (
                  <label
                    key={point}
                    className={cn('flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border py-2 tabular-nums hover:bg-accent/50 has-data-checked:border-primary/60 has-data-checked:bg-accent', picture && 'px-1')}
                  >
                    <Radio value={point} aria-label={picture ? picture.label(Number(point)) : labelFor(point)} />
                    {picture ? picture.render(Number(point)) : <span className="text-sm">{point}</span>}
                  </label>
                ))}
              </RadioGroup>
              {!picture && <div className="flex justify-between text-muted-foreground text-xs">
                <span>{LIKERT_LABELS.min}</span>
                <span>{LIKERT_LABELS.max}</span>
              </div>}
            </fieldset>
          )
        })}
      </div>

      {showMissing && missing.length > 0 && (
        <Alert variant="error">
          <AlertDescription>
            {pictureItem?.missingMessage ?? `Please answer ${missing.length === 1 ? 'the highlighted statement' : `all ${missing.length} highlighted statements`}.`}
          </AlertDescription>
        </Alert>
      )}
      <Button size="lg" className="self-start" onClick={submit}>
        Continue
      </Button>
    </Screen>
  )
}

function labelFor(point: string) {
  if (point === String(LIKERT_MIN)) return `${point}, ${LIKERT_LABELS.min}`
  if (point === String(LIKERT_MAX)) return `${point}, ${LIKERT_LABELS.max}`
  return point
}
