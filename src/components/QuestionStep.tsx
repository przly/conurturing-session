import { useEffect, useMemo, useRef } from 'react'
import { motion } from 'motion/react'
import { Label } from '@/components/ui/label'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { SceneCanvas } from '@/components/SceneCanvas'
import { resolveReaction } from '@/scene/reactions'
import { OPTION_KEYS, type OptionKey, type SurveyQuestion } from '@/survey/surveyContent'

interface QuestionStepProps {
  question: SurveyQuestion
  answer: OptionKey | undefined
  onAnswer: (answer: OptionKey) => void
  /** Move focus to the question heading (after Next/Back, not on first load). */
  focusHeading: boolean
}

const enter = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: [0.215, 0.61, 0.355, 1] as const },
}

export function QuestionStep({ question, answer, onAnswer, focusHeading }: QuestionStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = `question-${question.id}`
  const helperId = `${headingId}-helper`
  const reaction = useMemo(() => resolveReaction(question.id, answer), [question.id, answer])

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus()
  }, [question.id, focusHeading])

  return (
    <div className="flex flex-col gap-5">
      <motion.div key={question.id} {...enter} className="flex flex-col gap-2">
        <h2
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="text-balance font-semibold text-xl leading-snug tracking-tight outline-none sm:text-2xl"
        >
          {question.prompt}
        </h2>
        {question.helper && (
          <p id={helperId} className="text-muted-foreground text-sm">
            {question.helper}
          </p>
        )}
      </motion.div>

      {/* Stays mounted across questions so the object eases between poses. */}
      <SceneCanvas reaction={reaction} />

      <motion.div key={`${question.id}-options`} {...enter}>
        <RadioGroup
          aria-labelledby={headingId}
          aria-describedby={question.helper ? helperId : undefined}
          value={answer ?? null}
          onValueChange={(value) => onAnswer(value as OptionKey)}
          className="grid gap-2.5 sm:grid-cols-2"
        >
          {OPTION_KEYS.map((key) => (
            <Label
              key={key}
              className="flex items-center gap-2 rounded-lg border p-3 hover:bg-accent/50 has-data-checked:border-primary/48 has-data-checked:bg-accent/50"
            >
              <Radio value={key} />
              {question.options[key]}
            </Label>
          ))}
        </RadioGroup>
      </motion.div>
    </div>
  )
}
