import { useCallback, useEffect, useState } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { ArrowLeftIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, LogOutIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { ResearcherScript } from '@/tests/form/components/ResearcherScript'
import { Switch } from '@/components/ui/switch'
import { allConditionOrders, clipsFor, joinList, ROUND_CONFIG, WEATHER_CONFIG, type Order, type TestType } from '@/config'
import { downloadExport, fetchExport, type ExportData, type SessionRow } from '@/shared/data/export'
import { summariseForm } from '@/tests/form/summary'
import { summariseWeather } from '@/tests/weather/summary'
import { describeWeather, nextWeatherStep, WEATHER_RESEARCHER_SCRIPT } from '@/tests/weather/researcherScript'
import { openAdminChannel, type Command, type LiveEvent, type LiveStatus } from '@/shared/data/live'
import { supabase } from '@/shared/data/supabase'
import { cn } from '@/lib/utils'

const fmtTime = (t: number | null) =>
  t === null ? '–' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

const participantLink = (id: string, extra = '') =>
  `${window.location.origin}${window.location.pathname}?session=${id}${extra}`

/** `?admin=1`: researcher panel. */
export function AdminApp() {
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setAuth(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAuth(session))
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl tracking-tight">Twin study · researcher</h1>
        {auth && (
          <Button variant="ghost" size="sm" onClick={() => supabase?.auth.signOut()}>
            <LogOutIcon aria-hidden="true" />
            Sign out
          </Button>
        )}
      </div>
      {!supabase ? (
        <Alert variant="warning">
          <AlertTitle>Supabase is not configured</AlertTitle>
          <AlertDescription>
            Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README). Without them, participants' data is only
            kept on their device and can be downloaded from the final screen.
          </AlertDescription>
        </Alert>
      ) : !authReady ? null : !auth ? (
        <Login />
      ) : (
        <Dashboard email={auth.user.email ?? ''} />
      )}
    </main>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Researcher account from Supabase (see README).</CardDescription>
      </CardHeader>
      <form onSubmit={submit}>
        <CardPanel className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel>Password</FieldLabel>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardPanel>
        <CardFooter>
          <Button type="submit" loading={busy}>
            Sign in
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function Dashboard({ email }: { email: string }) {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    // The overview view adds status columns (current round, completed, weather fetch failed).
    const { data, error } = await supabase!.from('session_overview').select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setSessions(data as SessionRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase!.rpc('is_researcher').then(({ data, error }) => {
      if (error) setError(error.message)
      setAllowed(Boolean(data))
      if (data) void load()
    })
  }, [load])

  if (allowed === false) {
    return (
      <Alert variant="error">
        <AlertTitle>No access</AlertTitle>
        <AlertDescription>
          {email} is not on the researchers list. Add it in Supabase (see the end of supabase/schema.sql).
          {error && ` (${error})`}
        </AlertDescription>
      </Alert>
    )
  }
  if (allowed === null) return null

  const current = sessions.find((s) => s.id === selected) ?? null

  return (
    <>
      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {current ? (
        // Focused view while running a session: the script follows the participant.
        <>
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setSelected(null)}>
            <ArrowLeftIcon aria-hidden="true" />
            All sessions
          </Button>
          <SessionDetail
            key={current.id}
            session={current}
            onDeleted={async () => {
              setSelected(null)
              await load()
            }}
          />
        </>
      ) : (
        <>
          <NewSession
            sessions={sessions}
            onCreated={async (id) => {
              await load()
              setSelected(id)
            }}
          />
          <SessionList
            sessions={sessions}
            selected={selected}
            loading={loading}
            onSelect={setSelected}
            onRefresh={load}
          />
        </>
      )}
    </>
  )
}

/** What auto counterbalancing picks next, from the sessions created so far. */
function nextInBalance(sessions: SessionRow[], includeC: boolean) {
  const form = sessions.filter((s) => (s.test_type ?? 'form') === 'form')
  const weather = sessions.filter((s) => s.test_type === 'weather')
  const orders = allConditionOrders(includeC)
  const sameGroup = weather.filter((s) => Boolean(s.include_c) === includeC).length
  return {
    order: (form.length % 2 === 0 ? 'plant-orb' : 'orb-plant') as Order,
    conditions: joinList(orders[sameGroup % orders.length]),
  }
}

function NewSession({ sessions, onCreated }: { sessions: SessionRow[]; onCreated: (id: string) => void }) {
  const [code, setCode] = useState('')
  const [testType, setTestType] = useState<TestType>('form')
  const [order, setOrder] = useState<Order | null>(null)
  const [includeC, setIncludeC] = useState(false)
  const [conditions, setConditions] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  const suggested = nextInBalance(sessions, includeC)
  const effectiveOrder = order ?? suggested.order
  const effectiveConditions = conditions ?? suggested.conditions
  const conditionCount = includeC ? 3 : 2

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const id = crypto.randomUUID()
    const base = { id, participant_code: code.trim() || null, test_type: testType }
    const row: Record<string, unknown> =
      testType === 'form'
        ? { ...base, order_ab: effectiveOrder }
        : {
            ...base,
            include_c: includeC,
            condition_order: effectiveConditions,
            clip_assignment: joinList(clipsFor(conditionCount)),
            clip3_offset_sec: includeC ? 0 : null,
          }
    const { error } = await supabase!.from('sessions').insert(row)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setCreated(id)
    setCode('')
    setOrder(null)
    setConditions(null)
    onCreated(id)
  }

  const radioLabel = 'flex items-center gap-2 text-sm'
  const balanceHint = <span className="text-muted-foreground">(next in balance)</span>

  return (
    <Card>
      <CardHeader>
        <CardTitle>New session</CardTitle>
        <CardDescription>Creates a participant link. Open it on the participant's laptop.</CardDescription>
      </CardHeader>
      <form onSubmit={create}>
        <CardPanel className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Field className="sm:w-48">
              <FieldLabel>Participant code</FieldLabel>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="P01" required />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-medium text-sm">Test</legend>
              <RadioGroup
                value={testType}
                onValueChange={(v) => setTestType(v as TestType)}
                className="flex flex-row gap-4"
              >
                <label className={radioLabel}>
                  <Radio value="form" />
                  Form (plant vs orb)
                </label>
                <label className={radioLabel}>
                  <Radio value="weather" />
                  Weather
                </label>
              </RadioGroup>
            </fieldset>
          </div>

          {testType === 'form' ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-medium text-sm">Order</legend>
              <RadioGroup
                value={effectiveOrder}
                onValueChange={(v) => setOrder(v as Order)}
                className="flex flex-row flex-wrap gap-4"
              >
                {(['plant-orb', 'orb-plant'] as const).map((o) => (
                  <label key={o} className={radioLabel}>
                    <Radio value={o} />
                    {o === 'plant-orb' ? 'Plant first' : 'Orb first'}
                    {o === suggested.order && balanceHint}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          ) : (
            <div className="flex flex-col gap-5">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={includeC}
                  onCheckedChange={(checked) => {
                    setIncludeC(checked)
                    setConditions(null)
                  }}
                />
                Include condition C (Amsterdam weather)
              </label>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-medium text-sm">Condition order</legend>
                <RadioGroup
                  value={effectiveConditions}
                  onValueChange={(v) => setConditions(v as string)}
                  className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3"
                >
                  {allConditionOrders(includeC).map((list) => {
                    const value = joinList(list)
                    return (
                      <label key={value} className={radioLabel}>
                        <Radio value={value} />
                        <span className="font-mono">{list.join(' → ')}</span>
                        {value === suggested.conditions && balanceHint}
                      </label>
                    )
                  })}
                </RadioGroup>
                <p className="text-muted-foreground text-xs">
                  A = presence only · B = + hometown weather · C = + Amsterdam weather
                </p>
              </fieldset>
              <p className="text-muted-foreground text-sm">Every condition plays the same movement recording from the beginning.</p>
            </div>
          )}

          <Button type="submit" loading={busy} className="self-start">
            Create link
          </Button>
        </CardPanel>
      </form>
      {(error || created) && (
        <CardFooter className="flex-col items-stretch gap-2">
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {created && <LinkRow label="Participant link" href={participantLink(created)} />}
        </CardFooter>
      )}
    </Card>
  )
}

function LinkRow({ label, href }: { label: string; href: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{href}</code>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(href)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        <CopyIcon aria-hidden="true" />
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <Button variant="outline" size="sm" render={<a href={href} target="_blank" rel="noreferrer" />}>
        <ExternalLinkIcon aria-hidden="true" />
        Open
      </Button>
    </div>
  )
}

const summarisers = { form: summariseForm, weather: summariseWeather }
const testOf = (session: SessionRow) => session.test_type ?? 'form'
const weatherPreview = '?test=weather&fast=1&debug=1'

function rowsForTest(data: ExportData, test: TestType): ExportData {
  const sessions = data.sessions.filter((session) => testOf(session) === test)
  const ids = new Set(sessions.map((session) => session.id))
  return {
    sessions,
    events: data.events.filter((event) => ids.has(event.session_id)),
    answers: data.answers.filter((answer) => ids.has(answer.session_id)),
  }
}

function sessionStatus(session: SessionRow) {
  if (session.completed) return 'Completed'
  if (session.current_round) return `${testOf(session) === 'weather' ? 'Condition' : 'Round'} ${session.current_round}`
  return session.started_at ? 'Started' : 'Not started'
}

function SessionList(props: {
  sessions: SessionRow[]
  selected: string | null
  loading: boolean
  onSelect: (id: string) => void
  onRefresh: () => void
}) {
  const [filter, setFilter] = useState<TestType | 'all'>('all')
  const visibleSessions = props.sessions.filter((session) => filter === 'all' || testOf(session) === filter)
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const exportAll = async (format: 'json' | 'csv') => {
    setExporting(format)
    setError(null)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      const data = await fetchExport()
      const tests: TestType[] = filter === 'all' ? ['form', 'weather'] : [filter]
      for (const test of tests) {
        const rows = rowsForTest(data, test)
        if (rows.sessions.length) downloadExport(rows, `twin-study-${test}-${stamp}`, format, summarisers[test])
      }
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
    setExporting(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>Select one for the live view, overrides and export.</CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Test type
            <select
              className="h-8 rounded-md border bg-background px-2"
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
            >
              <option value="all">All</option>
              <option value="form">Form</option>
              <option value="weather">Weather</option>
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={props.onRefresh} loading={props.loading}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportAll('csv')} loading={exporting === 'csv'} disabled={exporting !== null || !visibleSessions.length}>
            <DownloadIcon aria-hidden="true" />
            Export all (CSV)
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportAll('json')} loading={exporting === 'json'} disabled={exporting !== null || !visibleSessions.length}>
            <DownloadIcon aria-hidden="true" />
            Export all (JSON)
          </Button>
        </div>
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {visibleSessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No sessions match this filter.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Test</th>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Person / hometown</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => props.onSelect(s.id)}
                    className={cn(
                      'cursor-pointer border-t hover:bg-accent/50',
                      s.id === props.selected && 'bg-accent',
                    )}
                  >
                    <td className="px-3 py-2">
                      <button type="button" className="font-medium underline-offset-4 hover:underline">
                        {s.participant_code || s.id.slice(0, 8)}
                      </button>
                      {s.weather_failed && (
                        <Badge variant="warning" className="ms-2 align-middle" title="Live weather couldn't be fetched; the fallback state was shown">
                          weather failed
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">{s.test_type ?? 'form'}</td>
                    <td className="px-3 py-2">{s.test_type === 'weather' ? s.condition_order : s.order_ab}</td>
                    <td className="px-3 py-2">
                      {s.test_type === 'weather'
                        ? [s.family_name, s.hometown_name].filter(Boolean).join(' · ') || '–'
                        : (s.imagined_person ?? '–')}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {sessionStatus(s)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardPanel>
    </Card>
  )
}

function SessionDetail({ session, onDeleted }: { session: SessionRow; onDeleted: () => void }) {
  const [status, setStatus] = useState<LiveStatus | null>(null)
  const [lastSeen, setLastSeen] = useState<number | null>(null)
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [channel, setChannel] = useState<ReturnType<typeof openAdminChannel>>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ch = openAdminChannel(
      session.id,
      (s) => {
        setStatus(s)
        setLastSeen(Date.now())
      },
      (e) => setEvents((prev) => [e, ...prev].slice(0, 40)),
    )
    setChannel(ch)
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      ch?.close()
      clearInterval(id)
    }
  }, [session.id])

  const connected = lastSeen !== null && now - lastSeen < 4000
  const isWeather = session.test_type === 'weather'
  const inRound = connected && status?.phase === 'round'

  const send = (command: Command, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    channel?.command(command)
  }

  const exportOne = async (format: 'json' | 'csv') => {
    setBusy(format)
    setError(null)
    try {
      downloadExport(await fetchExport([session.id]), `twin-${session.participant_code || session.id.slice(0, 8)}`, format, summarisers[testOf(session)])
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
    setBusy(null)
  }

  const remove = async () => {
    if (!window.confirm(`Delete session ${session.participant_code ?? session.id} and all its data? This cannot be undone.`)) return
    setBusy('delete')
    const { error } = await supabase!.from('sessions').delete().eq('id', session.id)
    setBusy(null)
    if (error) setError(error.message)
    else onDeleted()
  }

  return (
    <>
    <ResearcherScript
      status={status}
      connected={connected}
      steps={isWeather ? WEATHER_RESEARCHER_SCRIPT : undefined}
      describeStatus={isWeather ? describeWeather : undefined}
      getNextStep={isWeather ? (stepId, round) => nextWeatherStep(stepId, round, session.include_c ? 3 : 2) : undefined}
    />
    <Card>
      <CardHeader>
        <CardTitle>
          Session {session.participant_code || session.id.slice(0, 8)}{' '}
          <Badge variant={connected ? 'success' : 'outline'} className="ms-1 align-middle">
            {connected ? 'live' : 'not connected'}
          </Badge>
          {session.weather_failed && (
            <Badge variant="warning" className="ms-1 align-middle">
              weather fetch failed
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {isWeather ? (
            <>
              Weather test · conditions {session.condition_order} · clips {session.clip_assignment}
              {session.include_c && session.clip3_offset_sec !== null && ` (third from ${session.clip3_offset_sec} s)`}
              {session.hometown_name && ` · hometown ${session.hometown_name}`}
              {session.family_name && ` · family ${session.family_name}`}
            </>
          ) : (
            <>
              Order {session.order_ab}
              {session.imagined_person && ` · imagining ${session.imagined_person}`}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-5">
        <LinkRow label="Participant link" href={participantLink(session.id)} />
        {isWeather
          ? (
            <a href={weatherPreview} target="_blank" rel="noreferrer" className="self-start font-medium text-sm underline underline-offset-4">
              Preview Weather test (10× fast, debug)
            </a>
          )
          : <LinkRow label="Test link (10× fast, debug)" href={participantLink(session.id, '&fast=1&debug=1')} />}

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Phase" value={connected ? status!.phase : '–'} />
          <Stat
            label={isWeather ? "Part" : "Round"}
            value={
              connected && status!.round
                ? `${status!.round} · ${isWeather ? (status!.condition ?? '–') : status!.form}`
                : '–'
            }
          />
          <Stat
            label="Time"
            value={
              inRound
                ? `${fmtTime(status!.t)} / ${fmtTime(isWeather ? WEATHER_CONFIG.conditionSec : ROUND_CONFIG.durationSec)}`
                : '–'
            }
          />
          <Stat label="Unsaved rows" value={connected ? String(status!.pending) : '–'} />
        </div>
        {inRound && !isWeather && (
          <div className="flex flex-col gap-2">
            <Meter label="Health" value={status!.health ?? 0} />
            <Meter label="Partner pulse" value={status!.pulse ?? 0} />
            <p className="text-sm">
              Listening:{' '}
              <span className={cn('font-medium', status!.listening && 'text-success-foreground')}>
                {status!.listening ? 'speaking now' : 'quiet'}
              </span>
            </p>
          </div>
        )}

        {isWeather && (
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-sm">Manual override (fallback only; logged as manual)</h3>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={!inRound}
              onClick={() => send('skip', 'End this condition now?')}
            >
              Skip condition
            </Button>
          </div>
        )}
        {!isWeather && (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm">Manual overrides (fallback only; logged as manual)</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!inRound} onClick={() => send('pulse')}>
              Trigger pulse
            </Button>
            <Button variant="outline" size="sm" disabled={!inRound} onClick={() => send('wither')}>
              Trigger wither
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!inRound}
              onClick={() => send('skip', 'End this round now?')}
            >
              Skip round
            </Button>
            <Button
              variant="destructive-outline"
              size="sm"
              disabled={!inRound}
              onClick={() => send('restart', 'Restart this round from 0:00?')}
            >
              Restart round
            </Button>
          </div>
        </div>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm">Live events</h3>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm">Events appear here while the participant page is open.</p>
          ) : (
            <ol className="max-h-56 overflow-y-auto rounded-lg border text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3 border-b px-3 py-1.5 tabular-nums last:border-b-0">
                  <span className="w-16 text-muted-foreground">R{e.round} {fmtTime(e.t_sec)}</span>
                  <span className="w-28 font-medium">{e.type}</span>
                  {e.duration_sec !== undefined && <span>{e.duration_sec.toFixed(1)} s</span>}
                  {!isWeather && <span className="ms-auto text-muted-foreground">health {e.health.toFixed(2)}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardPanel>
      <CardFooter className="flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => exportOne('csv')} loading={busy === 'csv'}>
          <DownloadIcon aria-hidden="true" />
          Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportOne('json')} loading={busy === 'json'}>
          <DownloadIcon aria-hidden="true" />
          Export JSON
        </Button>
        <Button variant="destructive-outline" size="sm" className="ms-auto" onClick={remove} loading={busy === 'delete'}>
          <Trash2Icon aria-hidden="true" />
          Delete session
        </Button>
      </CardFooter>
    </Card>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  )
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="w-12 text-right tabular-nums">{value.toFixed(2)}</span>
    </div>
  )
}
