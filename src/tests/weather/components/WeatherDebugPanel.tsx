import { useEffect, useState } from 'react'
import { formatClock, SPEED, WEATHER_CONFIG, WEATHER_LABELS, WEATHER_STATES, type WeatherState } from '@/config'
import type { TwinScene } from '@/shared/scene/TwinScene'
import { cn } from '@/lib/utils'
import type { WeatherControl } from '../WeatherControl'
import type { PresenceDriver } from '../presence/PresenceDriver'
import type { WeatherSession } from '../WeatherSession'

interface WeatherDebugPanelProps {
  weather: WeatherControl
  /** Null on the lab page (`?lab=weather`). */
  session: WeatherSession | null
  scene: TwinScene | null
  presence?: PresenceDriver
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/**
 * `?debug=1` (and `?lab=weather`) only, never shown to participants.
 * Readouts for the session, condition and weather, plus buttons to set
 * the weather by hand. Changes during a condition are logged as source "debug".
 */
export function WeatherDebugPanel({ weather, session, scene, presence }: WeatherDebugPanelProps) {
  const [, setTick] = useState(0)
  const [instant, setInstant] = useState(session === null)
  const [open, setOpen] = useState(true)
  const [positionOverride, setPositionOverride] = useState<number | null>(null)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [])

  const seconds = instant ? 0 : WEATHER_CONFIG.transitionSec
  const setState = (state: WeatherState) => weather.transitionTo(state, 'debug', seconds)
  const look = weather.look()
  const layer = scene?.weather?.current
  const clock = session?.clock
  const running = session?.phase === 'round' && clock && !clock.ended
  const position = session?.position ?? 0
  const total = session?.conditions.length ?? 0

  return (
    <div className="pointer-events-auto fixed top-3 right-3 z-50 w-72 cursor-auto rounded-lg border border-white/10 bg-black/75 p-3 font-mono text-[11px] text-white/90 leading-relaxed backdrop-blur">
      <button type="button" className="mb-1 flex w-full justify-between font-semibold" onClick={() => setOpen(!open)}>
        <span>WEATHER DEBUG {SPEED > 1 && `· ${SPEED}× fast`}</span>
        <span>{session ? session.phase : 'lab'} {open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          {session && (
            <>
              <Row label="part">
                {position ? `${position}/${total} · ${session.conditionAt()}` : '–'}
                {session.preview && ' · preview'}
              </Row>
              <Row label="order">{session.conditions.join(' → ')}</Row>
              <Row label="clip">
                {session.track ? `${WEATHER_CONFIG.presence.recording} from ${session.track.offset} s` : '–'}
              </Row>
              <Row label="time">
                {clock ? `${formatClock(clock.t)} / ${formatClock(clock.durationSec)}` : '–'}
              </Row>
              <Row label="hometown">
                {session.personal.hometown ?? '–'}
                {session.personal.hometown && !session.hometownCoords && ' (no coords)'}
              </Row>
            </>
          )}

          <Section title="weather" />
          <Row label="layer">{weather.enabled ? 'on' : 'off'}</Row>
          <Row label="state">
            {look
              ? look.mix < 1
                ? `${look.from} → ${look.to} ${pct(look.mix)}`
                : look.to
              : '–'}
          </Row>
          <Row label="time of day">
            {weather.isDay ? 'day' : 'night'}
            {look && look.night > 0 && look.night < 1 && ` (${pct(look.night)} night)`}
          </Row>
          <Row label="source">{weather.source ?? '–'}</Row>
          {session?.prepared && (
            <>
              <Row label="place">{session.prepared.place.name || '–'}</Row>
              {session.prepared.data ? (
                <Row label="live data">
                  code {session.prepared.data.code} · {session.prepared.data.temperature.toFixed(1)}°C ·{' '}
                  {session.prepared.data.isDay ? 'day' : 'night'}
                </Row>
              ) : (
                session.prepared.error && <div className="text-red-300">fetch failed: {session.prepared.error}</div>
              )}
            </>
          )}
          {session?.script && (
            <Row label="next change">
              {(() => {
                const next = session.script.changes.find((c) => !c.done)
                if (!next) return 'none left'
                const shift = next.shift ? ` (${next.shift > 0 ? '+' : ''}${next.shift.toFixed(1)} s)` : ''
                return `→ ${next.to} at ${formatClock(next.at)}${shift}`
              })()}
            </Row>
          )}
          {session?.prepared?.source === 'url' && <div className="text-white/50">?weather= holds the state (no scripted changes)</div>}
          {layer && (
            <div className="mt-1 grid grid-cols-5 gap-1 text-center text-white/60">
              {(['shimmer', 'rain', 'snow', 'haze', 'flicker'] as const).map((k) => (
                <div key={k}>
                  <div className="truncate">{k}</div>
                  <div className="text-white/90">{layer[k].toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 grid grid-cols-3 gap-1">
            {WEATHER_STATES.map((state) => (
              <DebugButton key={state} active={weather.enabled && weather.state === state} onClick={() => setState(state)}>
                {WEATHER_LABELS[state]}
              </DebugButton>
            ))}
            <DebugButton active={!weather.enabled} onClick={() => weather.disable('debug')}>
              off
            </DebugButton>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <DebugButton active={weather.isDay} onClick={() => weather.setDay(true, 'debug', seconds)}>
              day
            </DebugButton>
            <DebugButton active={!weather.isDay} onClick={() => weather.setDay(false, 'debug', seconds)}>
              night
            </DebugButton>
            <DebugButton active={!instant} onClick={() => setInstant(false)}>
              {WEATHER_CONFIG.transitionSec} s change
            </DebugButton>
            <DebugButton active={instant} onClick={() => setInstant(true)}>
              instant
            </DebugButton>
          </div>

          <Section title="presence" />
          {presence ? (
            <>
              <Row label="cue">{presence.track.latest?.event ?? '–'}</Row>
              <Row label="state">{presence.mode}</Row>
              <Row label="x">{presence.x.toFixed(2)}</Row>
              <Row label="petals">{pct(presence.openness)} open</Row>
              {!session && (
                <div className="my-2 grid gap-1">
                  <label>
                    Presence position
                    <input
                      aria-valuetext={positionOverride === null ? 'Clip playback' : `${positionOverride}% from the left`}
                      className="block w-full accent-amber-300"
                      type="range"
                      min={0}
                      max={100}
                      value={positionOverride ?? 50}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        presence.previewPosition = value / 100
                        setPositionOverride(value)
                      }}
                    />
                  </label>
                  {positionOverride !== null && (
                    <DebugButton onClick={() => {
                      presence.previewPosition = null
                      setPositionOverride(null)
                    }}>Use clip</DebugButton>
                  )}
                </div>
              )}
              <Row label="video">{presence.track.clip} · {presence.track.video.currentTime.toFixed(2)} s</Row>
            </>
          ) : <Row label="state">–</Row>}

          {session && (
            <>
              <Section title="session" />
              <Row label="unsaved">{session.logger.online ? session.logger.pending : 'local only'}</Row>
              {session.logger.lastError && <div className="text-red-300">{session.logger.lastError}</div>}
              {running && (
                <div className="mt-2 grid grid-cols-1 gap-1">
                  <DebugButton onClick={() => clock.finish()}>skip condition</DebugButton>
                </div>
              )}
            </>
          )}
          {session?.phase === 'round' && (
            <div className="mt-2 text-white/50">changes here are logged with source “debug”</div>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title }: { title: string }) {
  return <div className="mt-2 mb-0.5 border-white/10 border-t pt-1.5 font-semibold text-white/70 uppercase">{title}</div>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-white/60">{label}</span>
      <span className="truncate text-right">{children}</span>
    </div>
  )
}

function DebugButton({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded border border-white/20 px-2 py-1 hover:bg-white/10',
        active && 'border-amber-300/70 bg-amber-300/15 text-amber-100',
      )}
    >
      {children}
    </button>
  )
}
