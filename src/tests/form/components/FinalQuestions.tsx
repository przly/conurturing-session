import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Screen } from '@/shared/components/Screen'
import type { Form } from '@/config'
import { FINAL_QUESTIONS, FORM_LABELS } from '@/tests/form/questions'

interface FinalQuestionsProps {
  /** In the order the participant met them. */
  forms: [Form, Form]
  onSubmit: (values: Record<string, string>) => void
}

export function FinalQuestions({ forms, onSubmit }: FinalQuestionsProps) {
  const [choice, setChoice] = useState<Form | null>(null)
  const [why, setWhy] = useState('')
  const [fade, setFade] = useState('')
  const [showMissing, setShowMissing] = useState(false)
  const complete = choice && why.trim() && fade.trim()

  const submit = () => {
    if (!complete) {
      setShowMissing(true)
      return
    }
    onSubmit({
      [FINAL_QUESTIONS.takeHome.id]: choice,
      [FINAL_QUESTIONS.why.id]: why.trim(),
      [FINAL_QUESTIONS.fade.id]: fade.trim(),
    })
  }

  return (
    <Screen title="Last questions" description="Now think about both objects.">
      <fieldset className="flex flex-col gap-3">
        <legend id="take-home" className="mb-3 font-medium">
          {FINAL_QUESTIONS.takeHome.text}
        </legend>
        <RadioGroup
          aria-labelledby="take-home"
          aria-invalid={(showMissing && !choice) || undefined}
          value={choice}
          onValueChange={(value) => setChoice(value as Form)}
          className="grid gap-2.5 sm:grid-cols-2"
        >
          {forms.map((form) => (
            <label
              key={form}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 hover:bg-accent/50 has-data-checked:border-primary/60 has-data-checked:bg-accent"
            >
              <Radio value={form} />
              {FORM_LABELS[form]}
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <Field invalid={showMissing && !why.trim()}>
        <FieldLabel>{FINAL_QUESTIONS.why.text}</FieldLabel>
        <Textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={3} />
      </Field>

      <Field invalid={showMissing && !fade.trim()}>
        <FieldLabel>{FINAL_QUESTIONS.fade.text}</FieldLabel>
        <Textarea value={fade} onChange={(e) => setFade(e.target.value)} rows={4} />
      </Field>

      {showMissing && !complete && (
        <Alert variant="error">
          <AlertDescription>Please answer all three questions.</AlertDescription>
        </Alert>
      )}
      <Button size="lg" className="self-start" onClick={submit}>
        Finish
      </Button>
    </Screen>
  )
}
