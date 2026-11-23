import { useEffect, useState } from 'react'
import { PRESENTATION, URL_PARAMS, WEATHER_CONFIG } from '@/config'
import { RoundCountdown } from '@/shared/components/RoundCountdown'
import { TwinCanvas } from '@/shared/components/TwinCanvas'
import type { TwinScene } from '@/shared/scene/TwinScene'
import { PresenceDriver } from '../presence/PresenceDriver'
import type { WeatherSession } from '../WeatherSession'
import { WeatherDebugPanel } from './WeatherDebugPanel'

interface ConditionStageProps {
  session: WeatherSession
  hideBackdrop?: boolean
  /** True once the condition has ended; triggers the fade out. */
  ending: boolean
  onFadedOut: () => void
}

/** Full-screen condition with the plant and a countdown. */
export function ConditionStage({ session, hideBackdrop = false, ending, onFadedOut }: ConditionStageProps) {
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
        floorDepthRadius={WEATHER_CONFIG.presence.floorDepthRadius}
        backdrop={hideBackdrop ? undefined : backdrop}
        getWeather={session.weather.look}
        onScene={setScene}
        style={{ opacity: visible ? 1 : 0, transition: `opacity ${fade}s ease-in-out` }}
      />
      <RoundCountdown ending={ending} readRemaining={() => session.clock?.remainingSec ?? WEATHER_CONFIG.conditionSec} />
      {URL_PARAMS.debug && <WeatherDebugPanel weather={session.weather} session={session} scene={scene} presence={presence} />}
    </div>
  )
}
