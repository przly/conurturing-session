import { useEffect, useState } from 'react'
import { PRESENTATION, URL_PARAMS, WEATHER_CONFIG } from '@/config'
import { TwinCanvas } from '@/shared/components/TwinCanvas'
import type { TwinScene } from '@/shared/scene/TwinScene'
import { PresenceDriver } from '../presence/PresenceDriver'
import type { WeatherSession } from '../WeatherSession'
import { WeatherDebugPanel } from './WeatherDebugPanel'

interface ConditionStageProps {
  session: WeatherSession
  /** True once the condition has ended; triggers the fade out. */
  ending: boolean
  onFadedOut: () => void
}

/** Full-screen condition: just the plant. No text, timers or controls. */
export function ConditionStage({ session, ending, onFadedOut }: ConditionStageProps) {
  const [presence] = useState(() => new PresenceDriver(session.track!))
  const [backdrop] = useState(() => ({ video: presence.track.video, ...WEATHER_CONFIG.presence }))
  const [visible, setVisible] = useState(false)
  const [scene, setScene] = useState<TwinScene | null>(null)

  // Fade in on the next frame, so the transition runs.
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (!ending) return
    const frame = requestAnimationFrame(() => setVisible(false))
    const id = setTimeout(onFadedOut, PRESENTATION.fadeOutSec * 1000)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(id)
    }
  }, [ending, onFadedOut])

  const fade = visible ? PRESENTATION.fadeInSec : PRESENTATION.fadeOutSec

  return (
    <div className="fixed inset-0 cursor-none bg-[#0d0e11]">
      <TwinCanvas
        form="plant"
        getState={presence.read}
        backdrop={backdrop}
        getWeather={session.weather.look}
        onScene={setScene}
        style={{ opacity: visible ? 1 : 0, transition: `opacity ${fade}s ease-in-out` }}
      />
      {URL_PARAMS.debug && <WeatherDebugPanel weather={session.weather} session={session} scene={scene} presence={presence} />}
    </div>
  )
}
