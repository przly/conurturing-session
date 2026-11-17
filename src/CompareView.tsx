import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { TwinCanvas } from '@/components/TwinCanvas'
import { ROUND_CONFIG } from '@/config'
import type { TwinState } from '@/twin/RoundRunner'

/**
 * `?compare=1`: both forms side by side, driven by ONE state object.
 * Use it to check they look equally expressive. Hold Space = listening.
 */
export function CompareView() {
  const [state] = useState<TwinState>(() => ({ health: ROUND_CONFIG.startHealth, pulse: 0, listening: false }))
  const [health, setHealth] = useState(state.health)
  const [listening, setListening] = useState(false)
  const [pulse, setPulse] = useState(0)
  const pulseStart = useRef<number | null>(null)

  useEffect(() => {
    state.health = health
    state.listening = listening
  }, [state, health, listening])

  // Same pulse curve as a round, at 10× speed so it's quick to judge.
  useEffect(() => {
    const id = setInterval(() => {
      if (pulseStart.current === null) return
      const p = Math.min(1, ((performance.now() - pulseStart.current) / 1000) * 10 / ROUND_CONFIG.pulseLingerSec)
      state.pulse = 0.5 * (1 + Math.cos(Math.PI * p))
      setPulse(state.pulse)
      if (p >= 1) pulseStart.current = null
    }, 50)
    return () => clearInterval(id)
  }, [state])

  useEffect(() => {
    const set = (down: boolean) => (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      setListening(down)
    }
    const down = set(true)
    const up = set(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return (
    <div className="flex h-dvh flex-col bg-[#0d0e11] text-foreground">
      <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-2">
        <TwinCanvas form="plant" getState={() => state} />
        <TwinCanvas form="orb" getState={() => state} />
      </div>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t bg-background p-4">
        <label className="flex min-w-64 flex-1 items-center gap-3 text-sm">
          <span className="w-28 tabular-nums">health {health.toFixed(2)}</span>
          <Slider
            className="flex-1"
            min={ROUND_CONFIG.healthFloor}
            max={1}
            step={0.01}
            value={health}
            onValueChange={(v) => setHealth(Array.isArray(v) ? v[0] : (v as number))}
          />
        </label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setHealth(ROUND_CONFIG.witherTarget)}>
            withered
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHealth(ROUND_CONFIG.startHealth)}>
            start
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHealth(1)}>
            full
          </Button>
        </div>
        <Button size="sm" onClick={() => (pulseStart.current = performance.now())}>
          partner pulse <span className="tabular-nums opacity-70">{pulse.toFixed(2)}</span>
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={listening} onCheckedChange={setListening} />
          listening (or hold Space)
        </label>
      </div>
    </div>
  )
}
