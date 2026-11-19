import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { Screen } from '@/shared/components/Screen'
import { STUDY_TEXT as copy } from '../text'

interface ComprehensionCheckProps {
  options: typeof copy.checkOptions
  onAnswer: (answer: string, correct: boolean) => void
  onReplay: () => void
  onContinue: () => void
}

export function ComprehensionCheck({ options, onAnswer, onReplay, onContinue }: ComprehensionCheckProps) {
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)
  const submit = () => {
    const correct = answer === 'glow'
    onAnswer(answer, correct)
    if (correct) onContinue()
    else setWrong(true)
  }

  return (
    <Screen title={copy.checkTitle}>
      <fieldset>
        <legend id="check-question" className="mb-3 font-medium">{copy.checkQuestion}</legend>
        <RadioGroup
          aria-labelledby="check-question"
          disabled={wrong}
          value={answer}
          onValueChange={(value) => setAnswer(String(value))}
          className="grid gap-2.5"
        >
          {options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 rounded-lg border p-3 has-data-checked:bg-accent">
              <Radio value={option.id} />
              {option.label}
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      {wrong ? (
        <>
          <Alert><AlertDescription>{copy.checkExplanation}</AlertDescription></Alert>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={onReplay}>{copy.replay}</Button>
            <Button size="lg" variant="outline" onClick={onContinue}>{copy.continue}</Button>
          </div>
        </>
      ) : (
        <Button size="lg" className="self-start" disabled={!answer} onClick={submit}>{copy.continue}</Button>
      )}
    </Screen>
  )
}
