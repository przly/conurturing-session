import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Form } from '@/config'
import { TwinScene } from '@/shared/scene/TwinScene'
import type { TwinState } from '@/shared/scene/state'
import type { VideoBackdropOptions } from '@/shared/scene/VideoBackdrop'
import type { WeatherLook } from '@/shared/scene/weather'
import { cn } from '@/lib/utils'

let Scene = TwinScene
const sceneUpdateListeners = new Set<() => void>()

function subscribeToSceneUpdates(listener: () => void) {
  sceneUpdateListeners.add(listener)
  return () => { sceneUpdateListeners.delete(listener) }
}

function getSceneConstructor() {
  return Scene
}

if (import.meta.hot) {
  import.meta.hot.accept('@/shared/scene/TwinScene', (module) => {
    if (!module) return
    Scene = module.TwinScene
    sceneUpdateListeners.forEach((listener) => listener())
  })
}

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
  petalColor?: string
  petalWidthScale?: number
  leafWidthScale?: number
  leafRotationOffset?: number
  floorDepthRadius?: number
  disableFog?: boolean
  cameraTargetY?: number
  stemHeightScale?: number
  floorFrontExtend?: number
  backdrop?: VideoBackdropOptions
}

/** React wrapper around the imperative Three.js scene. */
export function TwinCanvas({ form, getState, className, style, onScene, getWeather, backdrop, petalColor, petalWidthScale, leafWidthScale, leafRotationOffset, floorDepthRadius, floorFrontExtend, disableFog, cameraTargetY, stemHeightScale }: TwinCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const getStateRef = useRef(getState)
  const getWeatherRef = useRef(getWeather)
  const hasWeather = Boolean(getWeather)
  const onSceneRef = useRef(onScene)
  const [failed, setFailed] = useState(false)
  const SceneConstructor = useSyncExternalStore(subscribeToSceneUpdates, getSceneConstructor)

  useEffect(() => {
    getStateRef.current = getState
    getWeatherRef.current = getWeather
    onSceneRef.current = onScene
  })

  useEffect(() => {
    if (!containerRef.current) return
    let scene: TwinScene
    try {
      scene = new SceneConstructor(
        containerRef.current,
        form,
        () => getStateRef.current(),
        { getWeather: hasWeather ? () => getWeatherRef.current?.() ?? null : undefined, backdrop, petalColor, petalWidthScale, leafWidthScale, leafRotationOffset, floorDepthRadius, floorFrontExtend, disableFog, cameraTargetY, stemHeightScale },
      )
    } catch (error) {
      console.error(error)
      setFailed(true)
      return
    }
    setFailed(false)
    onSceneRef.current?.(scene)
    return () => {
      onSceneRef.current?.(null)
      scene.dispose()
    }
  }, [SceneConstructor, form, hasWeather, backdrop, petalColor, petalWidthScale, leafWidthScale, leafRotationOffset, floorDepthRadius, floorFrontExtend, disableFog, cameraTargetY, stemHeightScale])

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
