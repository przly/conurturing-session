import { useState } from 'react'
import { MicIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Screen } from '@/components/Screen'

export function StartScreen({ onStart }: { onStart: (imaginedPerson: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const start = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await onStart(name)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Welcome" description="Thank you for taking part. The researcher will explain what happens next.">
      <form onSubmit={start} className="flex flex-col gap-6">
        <Field>
          <FieldLabel>Who are you imagining has the other twin?</FieldLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example: my mum, Sara"
            autoComplete="off"
            maxLength={80}
          />
          <FieldDescription>Optional.</FieldDescription>
        </Field>

        <Alert variant="info">
          <MicIcon aria-hidden="true" />
          <AlertTitle>About your microphone</AlertTitle>
          <AlertDescription>
            This page uses your microphone only to notice when you are speaking. No sound is recorded, stored or
            sent anywhere. Only when you spoke and for how long is saved.
          </AlertDescription>
        </Alert>

        <Button type="submit" size="lg" loading={busy} className="self-start">
          Start
        </Button>
      </form>
    </Screen>
  )
}
