import { useEffect, useState } from 'react'
import { CheckIcon, MicIcon, MicOffIcon, TriangleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress'
import { Screen } from '@/components/Screen'
import { MIC_CONFIG } from '@/config'
import { MicError, type Calibration as CalibrationResult, type MicDetector } from '@/twin/MicDetector'

type Step = 'intro' | 'silence' | 'speech' | 'result' | 'error'

interface CalibrationProps {
  mic: MicDetector
  onDone: (calibration: CalibrationResult) => void
}

const SENTENCE = 'Hello, it’s me. I’m here. How was your day today?'

export function Calibration({ mic, onDone }: CalibrationProps) {
  const [step, setStep] = useState<Step>('intro')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<CalibrationResult | null>(null)
  const [error, setError] = useState<MicError | null>(null)

  const run = async () => {
    setError(null)
    try {
      await mic.start()
    } catch (e) {
      setError(e instanceof MicError ? e : new MicError('other', String(e)))
      setStep('error')
      return
    }
    setStep('silence')
    setProgress(0)
    const noise = await mic.measure(MIC_CONFIG.silenceSec, 0.5, setProgress)
    setStep('speech')
    setProgress(0)
    // Upper percentile: catches the spoken parts even with pauses between words.
    const speech = await mic.measure(MIC_CONFIG.speechSec, 0.8, setProgress)
    setResult(mic.setCalibration(noise, speech))
    setStep('result')
  }

  if (step === 'error' && error) {
    return (
      <Screen title="Microphone needed">
        <Alert variant="error">
          <MicOffIcon aria-hidden="true" />
          <AlertTitle>{error.message}</AlertTitle>
          <AlertDescription>
            {error.kind === 'denied' ? (
              <>
                Allow microphone access for this page, then reload it.
                <br />
                Chrome: click the icon left of the address bar → Microphone → Allow.
                <br />
                Safari: Safari menu → Settings for This Website → Microphone → Allow.
              </>
            ) : error.kind === 'no-device' ? (
              'Connect a microphone (or check that the laptop microphone is enabled), then try again.'
            ) : (
              'Please tell the researcher.'
            )}
          </AlertDescription>
        </Alert>
        <div className="flex gap-3">
          <Button onClick={run}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </Screen>
    )
  }

  if (step === 'intro') {
    return (
      <Screen
        title="Microphone check"
        description="First we check how loud the room is and how loud your voice is. This takes about 10 seconds."
      >
        <Button size="lg" className="self-start" onClick={run}>
          <MicIcon aria-hidden="true" />
          Turn on microphone
        </Button>
      </Screen>
    )
  }

  if (step === 'result' && result) {
    return (
      <Screen title={result.reliable ? 'Microphone ready' : 'We could not hear you clearly'}>
        {result.reliable ? (
          <Alert variant="success">
            <CheckIcon aria-hidden="true" />
            <AlertDescription>Your voice came through clearly.</AlertDescription>
          </Alert>
        ) : (
          <Alert variant="warning">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertDescription>
              Your voice was not much louder than the room. Try again a bit closer to the laptop, speaking at a
              normal volume.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant={result.reliable ? 'default' : 'outline'} onClick={() => onDone(result)}>
            {result.reliable ? 'Continue' : 'Continue anyway'}
          </Button>
          <Button variant={result.reliable ? 'outline' : 'default'} onClick={run}>
            Check again
          </Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title={step === 'silence' ? 'Please stay quiet' : 'Now read this out loud'}>
      {step === 'speech' && (
        <p className="text-balance font-medium text-xl leading-snug sm:text-2xl">“{SENTENCE}”</p>
      )}
      {step === 'silence' && <p className="text-muted-foreground">Measuring the room…</p>}
      <Progress value={Math.round(progress * 100)} aria-label="Measuring">
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>
      <LevelMeter mic={mic} />
    </Screen>
  )
}

/** Live input level, so the participant can see the mic hears them. */
function LevelMeter({ mic }: { mic: MicDetector }) {
  const [level, setLevel] = useState(mic.level)
  useEffect(() => {
    const id = setInterval(() => setLevel(mic.level), 60)
    return () => clearInterval(id)
  }, [mic])
  const width = Math.min(100, Math.max(0, ((level + 80) / 60) * 100))
  return (
    <div className="flex items-center gap-3 text-muted-foreground text-sm">
      <MicIcon aria-hidden="true" className="size-4" />
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-success transition-[width] duration-75" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
