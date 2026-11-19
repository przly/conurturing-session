import { useEffect, useState } from 'react'
import { SPEED } from '@/config'
import type { TwinScene } from '@/shared/scene/TwinScene'
import type { StudySession } from '@/tests/form/StudySession'

interface DebugOverlayProps {
  session: StudySession
  scene: TwinScene | null
}

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const pct = (x: number) => `${Math.round(x * 100)}%`

/**
 * `?debug=1` only, never shown to participants. Shows the shared state,
 * mic level and thresholds, and offers the same overrides as the admin
 * panel. Hold Space to simulate talking.
 */
export function DebugOverlay({ session, scene }: DebugOverlayProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest('input, textarea')
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) {
        e.preventDefault()
        session.simulateTalk(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') session.simulateTalk(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [session])

  const { state, runner, mic, logger } = session
  const cal = mic.calibration
  const levelPos = (db: number) => `${Math.min(100, Math.max(0, db + 100))}%`
  const e = scene?.expression

  return (
    <div className="pointer-events-auto fixed top-3 left-3 z-50 w-64 rounded-lg border border-white/10 bg-black/75 p-3 font-mono text-[11px] text-white/90 leading-relaxed backdrop-blur">
      <div className="mb-1 flex justify-between font-semibold">
        <span>DEBUG {SPEED > 1 && `· ${SPEED}× fast`}</span>
        <span>{session.phase}</span>
      </div>
      <Row label="round">{session.round ? `${session.round} · ${session.form}` : '–'}</Row>
      <Row label="time">{runner ? fmtTime(runner.t) : '–'}</Row>
      <Bar label="health" value={state.health} />
      <Bar label="pulse" value={state.pulse} />
      <Row label="listening">{state.listening ? 'yes' : 'no'}</Row>
      <Bar label="voice" value={state.voice} />
      {e && <Row label="openness">{pct(e.openness)}</Row>}
      <div className="mt-2">mic {mic.level.toFixed(1)} dB</div>
      <div className="relative mt-1 h-2 rounded bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded bg-emerald-400" style={{ width: levelPos(mic.level) }} />
        {cal && (
          <>
            <div className="absolute inset-y-[-2px] w-px bg-sky-300" style={{ left: levelPos(cal.offDb) }} title="off" />
            <div className="absolute inset-y-[-2px] w-px bg-amber-300" style={{ left: levelPos(cal.onDb) }} title="on" />
          </>
        )}
      </div>
      {cal && (
        <div className="mt-1 text-white/60">
          noise {cal.noiseDb.toFixed(0)} · speech {cal.speechDb.toFixed(0)} · on {cal.onDb.toFixed(0)}
          {!cal.reliable && ' · weak'}
        </div>
      )}
      <Row label="unsaved">{logger.online ? logger.pending : 'local only'}</Row>
      {logger.lastError && <div className="text-red-300">{logger.lastError}</div>}
      {runner && session.phase === 'round' && (
        <div className="mt-2 grid grid-cols-2 gap-1">
          <DebugButton onClick={() => runner.triggerPulse('manual')}>pulse</DebugButton>
          <DebugButton onClick={() => runner.triggerWither('manual')}>wither</DebugButton>
          <DebugButton onClick={() => runner.skip()}>skip round</DebugButton>
          <DebugButton onClick={() => runner.restart()}>restart</DebugButton>
        </div>
      )}
      <div className="mt-2 text-white/50">hold Space = simulated talk</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/60">{label}</span>
      <span>{children}</span>
    </div>
  )
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Row label={label}>{value.toFixed(3)}</Row>
      <div className="h-1.5 rounded bg-white/10">
        <div className="h-full rounded bg-amber-300" style={{ width: pct(value) }} />
      </div>
    </div>
  )
}

function DebugButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-white/20 px-2 py-1 hover:bg-white/10"
    >
      {children}
    </button>
  )
}
