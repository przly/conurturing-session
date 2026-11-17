import { useEffect, useState } from 'react'
import { CheckIcon, DownloadIcon, TriangleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Screen } from '@/components/Screen'
import { download } from '@/data/export'
import type { StudySession } from '@/twin/StudySession'

export function DoneScreen({ session }: { session: StudySession }) {
  const { logger } = session
  const [pending, setPending] = useState(logger.pending)
  const [error, setError] = useState(logger.lastError)

  useEffect(() => {
    const update = () => {
      setPending(logger.pending)
      setError(logger.lastError)
    }
    logger.onChange = update
    logger.flushSoon()
    const id = setInterval(update, 1000)
    return () => {
      clearInterval(id)
      logger.onChange = null
    }
  }, [logger])

  // Warn before closing while data is still unsaved.
  useEffect(() => {
    if (!pending) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending])

  return (
    <Screen title="Thank you" description="That's the end of the session.">
      {!logger.online ? (
        <Alert variant="warning">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>Saved on this device only</AlertTitle>
          <AlertDescription>
            No database is set up, so the data was not sent anywhere. Download it now.
          </AlertDescription>
        </Alert>
      ) : pending > 0 ? (
        <Alert variant={error ? 'warning' : 'default'}>
          {error ? <TriangleAlertIcon aria-hidden="true" /> : <Spinner />}
          <AlertTitle>{error ? 'Still trying to save…' : 'Saving…'}</AlertTitle>
          <AlertDescription>
            Please keep this page open{error ? ' and let the researcher know' : ''}.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="success">
          <CheckIcon aria-hidden="true" />
          <AlertTitle>Everything is saved</AlertTitle>
          <AlertDescription>You can let the researcher know you're done.</AlertDescription>
        </Alert>
      )}

      {(!logger.online || error) && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() =>
            download(
              `twin-session-${session.id}.json`,
              JSON.stringify({ session_id: session.id, order: session.order, imagined_person: session.imaginedPerson, ...logger.archive }, null, 2),
              'application/json',
            )
          }
        >
          <DownloadIcon aria-hidden="true" />
          Download data
        </Button>
      )}
    </Screen>
  )
}
