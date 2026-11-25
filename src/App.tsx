import { lazy, Suspense, useEffect, useState } from 'react'
import { AdminApp } from '@/AdminApp'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { clipsFor, URL_PARAMS, type SessionConfig } from '@/config'
import { Screen } from '@/shared/components/Screen'
import { loadSessionConfig } from '@/shared/data/session'
import { CompareView } from '@/tests/form/CompareView'
import { FormTest } from '@/tests/form/FormTest'
import { IntroPreview } from '@/tests/weather/IntroPreview'
import { PresenceTest } from '@/tests/weather/PresenceTest'
import { WeatherLab } from '@/tests/weather/WeatherLab'
import { WeatherTest } from '@/tests/weather/WeatherTest'

const FlowerPair = lazy(() => import('@/tests/flowers/FlowerPair'))

/**
 * Router:
 *  - `?admin=1` researcher panel, `?compare=1` plant/orb tuning view,
 *    `?lab=weather` weather look tuning (plant + debug panel, no session)
 *  - `?session=<id>` asks the database which test the session runs
 *  - `?test=flowers` live flower pairing
 *  - `/observe` one camera controls two flowers
 *  - `?test=weather` local Weather test preview (nothing saved)
 *  - `/intro` only the Weather test intro (also available at `?test=intro`)
 *  - anything else: the Form test, exactly as before
 */
export default function App() {
  const path = window.location.pathname.replace(/\/$/, '')
  if (path === '/intro') return <IntroPreview />
  if (path === '/observe') return <Suspense fallback={null}><FlowerPair mode="observe" /></Suspense>
  if (URL_PARAMS.admin) return <AdminApp />
  if (URL_PARAMS.compare) return <CompareView />
  if (URL_PARAMS.lab) return <WeatherLab />
  if (URL_PARAMS.session) return <SessionRouter id={URL_PARAMS.session} />
  if (URL_PARAMS.presenceTest) return <PresenceTest />
  if (URL_PARAMS.introPreview) return <IntroPreview />
  if (URL_PARAMS.flowerPair) return <Suspense fallback={null}><FlowerPair /></Suspense>
  if (URL_PARAMS.test === 'weather') return <WeatherTest sessionId={null} config={PREVIEW_CONFIG} />
  return <FormTest />
}

/** Preview runs all three conditions so every part can be checked. */
const PREVIEW_CONFIG: SessionConfig = {
  test_type: 'weather',
  order_ab: null,
  condition_order: URL_PARAMS.conditions ?? ['A', 'B', 'C'],
  clip_assignment: clipsFor((URL_PARAMS.conditions ?? ['A', 'B', 'C']).length),
  clip3_offset_sec: 0,
  include_c: (URL_PARAMS.conditions ?? ['C']).includes('C'),
}

type Loaded = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; config: SessionConfig | null }

function SessionRouter({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadSessionConfig(id).then(
      (config) => !cancelled && setLoaded({ state: 'ready', config }),
      (error) => !cancelled && setLoaded({ state: 'error', message: String((error as Error)?.message ?? error) }),
    )
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  const retry = () => {
    setLoaded({ state: 'loading' })
    setAttempt((n) => n + 1)
  }

  if (loaded.state === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Spinner />
      </main>
    )
  }
  if (loaded.state === 'error') {
    return (
      <Screen
        title="Couldn't load this session"
        description="Check the internet connection and try again. If it keeps happening, let the researcher know."
      >
        <p className="text-muted-foreground text-xs">{loaded.message}</p>
        <Button size="lg" className="self-start" onClick={retry}>
          Try again
        </Button>
      </Screen>
    )
  }
  const { config } = loaded
  if (config?.test_type === 'weather') return <WeatherTest sessionId={id} config={config} />
  // Unknown id (created on Start, as before) or a form session.
  return <FormTest />
}
