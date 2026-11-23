import { useEffect, useState } from 'react'
import { formatClock } from '@/config'

export function RoundCountdown({ readRemaining, ending }: { readRemaining: () => number; ending: boolean }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil(readRemaining())))

  useEffect(() => {
    if (ending) return
    const update = () => setSeconds(Math.max(0, Math.ceil(readRemaining())))
    update()
    const timer = window.setInterval(update, 100)
    return () => window.clearInterval(timer)
  }, [ending, readRemaining])

  return (
    <div
      role="timer"
      aria-label="Time remaining"
      className="pointer-events-none absolute top-3 left-3 z-10 rounded-md bg-black/75 px-3 py-1.5 text-sm font-medium text-white tabular-nums"
    >
      {formatClock(ending ? 0 : seconds)}
    </div>
  )
}
