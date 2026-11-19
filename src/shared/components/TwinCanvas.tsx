import { useEffect, useRef, useState } from 'react'
import type { Form } from '@/config'
import { TwinScene } from '@/shared/scene/TwinScene'
import type { TwinState } from '@/shared/scene/state'
import type { VideoBackdropOptions } from '@/shared/scene/VideoBackdrop'
import type { WeatherLook } from '@/shared/scene/weather'
import { cn } from '@/lib/utils'

interface TwinCanvasProps {
  form: Form
  /** Read every frame, so it can return a live, mutable state object. */
  getState: () => TwinState
  className?: string
  style?: React.CSSProperties
  /** Receives the scene (for the debug overlay). */
  onScene?: (scene: TwinScene | null) => void
  /** Weather test only: read every frame. Leave out for the form test (no weather layer). */
  getWeather?: () => WeatherLook | null
  backdrop?: VideoBackdropOptions
}

/** React wrapper around the imperative Three.js scene. */
export function TwinCanvas({ form, getState, className, style, onScene, getWeather, backdrop }: TwinCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const getStateRef = useRef(getState)
  const getWeatherRef = useRef(getWeather)
  const hasWeather = Boolean(getWeather)
  const onSceneRef = useRef(onScene)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getStateRef.current = getState
    getWeatherRef.current = getWeather
    onSceneRef.current = onScene
  })

  useEffect(() => {
    if (!containerRef.current) return
    let scene: TwinScene
    try {
      scene = new TwinScene(
        containerRef.current,
        form,
        () => getStateRef.current(),
        { getWeather: hasWeather ? () => getWeatherRef.current?.() ?? null : undefined, backdrop },
      )
    } catch (error) {
      console.error(error)
      setFailed(true)
      return
    }
    onSceneRef.current?.(scene)
    return () => {
      onSceneRef.current?.(null)
      scene.dispose()
    }
  }, [form, hasWeather, backdrop])

  return (
    <div ref={containerRef} aria-hidden="true" className={cn('size-full', className)} style={style}>
      {failed && (
        <div className="flex size-full items-center justify-center p-6 text-center text-muted-foreground text-sm">
          3D view unavailable in this browser. Please use an up-to-date Chrome or Safari.
        </div>
      )}
    </div>
  )
}
