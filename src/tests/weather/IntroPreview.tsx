import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Screen } from '@/shared/components/Screen'
import { IntroScreen } from './components/IntroScreen'

/** `?test=intro`: just the Weather test intro, on repeat. Nothing is logged. */
export function IntroPreview() {
  const [run, setRun] = useState(0)
  const [finished, setFinished] = useState(false)

  if (finished) {
    return (
      <Screen title="Intro preview" description="The intro has ended.">
        <Button className="self-start" onClick={() => { setFinished(false); setRun(run + 1) }}>Watch again</Button>
      </Screen>
    )
  }
  return <IntroScreen key={run} onStart={() => {}} onEnd={() => {}} onContinue={() => setFinished(true)} />
}
