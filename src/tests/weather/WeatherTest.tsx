import type { SessionConfig } from '@/config'
import { Screen } from '@/shared/components/Screen'

interface WeatherTestProps {
  /** Null for a local preview (`?test=weather`): nothing is saved. */
  sessionId: string | null
  config: SessionConfig
}

/** Weather test. Placeholder until the flow is built (step 3). */
export function WeatherTest({ sessionId, config }: WeatherTestProps) {
  const conditions = config.condition_order ?? []
  return (
    <Screen title="Weather test" description="This test is still being built.">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Session</dt>
        <dd>{sessionId ?? 'preview (nothing saved)'}</dd>
        <dt className="text-muted-foreground">Conditions</dt>
        <dd>{conditions.join(' → ')}</dd>
        <dt className="text-muted-foreground">Clips</dt>
        <dd>
          {(config.clip_assignment ?? []).join(', ')}
          {conditions.length === 3 && ` (third from ${config.clip3_offset_sec ?? 0} s)`}
        </dd>
      </dl>
    </Screen>
  )
}
