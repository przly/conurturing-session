import { useEffect, useState } from 'react'
import { URL_PARAMS, WEATHER_CONFIG } from '@/config'
import { TwinCanvas } from '@/shared/components/TwinCanvas'
import type { VideoBackdropOptions } from '@/shared/scene/VideoBackdrop'
import type { TwinScene } from '@/shared/scene/TwinScene'
import { WeatherDebugPanel } from './components/WeatherDebugPanel'
import { loadRecordedPresence } from './presence/CueTrack'
import { PresenceDriver } from './presence/PresenceDriver'
import { WeatherControl } from './WeatherControl'

/** Full-screen playback and weather controls, with no session or logging. */
export function WeatherLab() {
  const [weather] = useState(() => {
    const control = new WeatherControl()
    control.show(URL_PARAMS.weather ?? 'clear', true, URL_PARAMS.weather ? 'url' : 'debug')
    return control
  })
  const [scene, setScene] = useState<TwinScene | null>(null)
  const [preview, setPreview] = useState<{ presence: PresenceDriver; backdrop: VideoBackdropOptions }>()
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let frame = 0
    void loadRecordedPresence(controller.signal).then(async (track) => {
      await track.video.play()
      if (controller.signal.aborted) return
      const update = () => {
        track.update(() => {})
        frame = requestAnimationFrame(update)
      }
      update()
      const presence = new PresenceDriver(track)
      setPreview({
        presence,
        backdrop: { video: track.video, ...WEATHER_CONFIG.presence, getPreviewPosition: () => presence.previewPosition },
      })
    }).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => {
      controller.abort()
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-[#0d0e11]">
      {preview && <TwinCanvas form="plant" getState={preview.presence.read} getWeather={weather.look} onScene={setScene} floorDepthRadius={WEATHER_CONFIG.presence.floorDepthRadius} backdrop={preview.backdrop} />}
      {error && <p className="p-4 text-center text-white">Presence preview could not load.</p>}
      <WeatherDebugPanel weather={weather} session={null} scene={scene} presence={preview?.presence} />
    </div>
  )
}
