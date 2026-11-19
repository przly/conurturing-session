import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import type { WeatherCondition } from '@/config'
import { Screen } from '@/shared/components/Screen'
import { STUDY_TEXT as copy } from '../text'

interface FinalQuestionsProps {
  conditions: WeatherCondition[]
  onSubmit: (values: Record<string, string>) => void
}

export function FinalQuestions({ conditions, onSubmit }: FinalQuestionsProps) {
  const [choice, setChoice] = useState<string | null>(null)
  const [colour, setColour] = useState('')
  const [weather, setWeather] = useState('')
  const [showMissing, setShowMissing] = useState(false)
  const complete = choice && colour.trim() && weather.trim()

  const submit = () => {
    if (!complete || choice === null) {
      setShowMissing(true)
      return
    }
    onSubmit({
      preferred_condition: conditions[Number(choice) - 1],
      preferred_version: choice,
      colour_changes: colour.trim(),
      weather_home: weather.trim(),
    })
  }

  return (
    <Screen title={copy.finalTitle} description={copy.finalDescription}>
      <fieldset>
        <legend id="preferred-version" className="mb-3 font-medium">{copy.preferred}</legend>
        <RadioGroup
          aria-labelledby="preferred-version"
          aria-invalid={(showMissing && !choice) || undefined}
          value={choice}
          onValueChange={(value) => setChoice(String(value))}
          className="grid gap-2.5 sm:grid-cols-3"
        >
          {conditions.map((condition, index) => (
            <label key={condition} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 hover:bg-accent/50 has-data-checked:bg-accent">
              <Radio value={String(index + 1)} />
              {copy.version(index + 1)}
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      <Field invalid={showMissing && !colour.trim()}>
        <FieldLabel>{copy.colourChanges}</FieldLabel>
        <Textarea rows={3} value={colour} onChange={(e) => setColour(e.target.value)} />
      </Field>
      <Field invalid={showMissing && !weather.trim()}>
        <FieldLabel>{copy.weatherHome}</FieldLabel>
        <Textarea rows={4} value={weather} onChange={(e) => setWeather(e.target.value)} />
      </Field>
      {showMissing && !complete && <Alert variant="error"><AlertDescription>{copy.finalMissing}</AlertDescription></Alert>}
      <Button size="lg" className="self-start" onClick={submit}>{copy.finish}</Button>
    </Screen>
  )
}
