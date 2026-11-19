import { useEffect, useRef, useState } from 'react'
import type { Form } from '@/config'
import { TwinScene } from '@/shared/scene/TwinScene'
import type { TwinState } from '@/shared/scene/state'
import { cn } from '@/lib/utils'

interface TwinCanvasProps {
  form: Form
  /** Read every frame, so it can return a live, mutable state object. */
  getState: () => TwinState
  className?: string
  style?: React.CSSProperties
  /** Receives the scene (for the debug overlay). */
  onScene?: (scene: TwinScene | null) => void
}

/** React wrapper around the imperative Three.js scene. */
export function TwinCanvas({ form, getState, className, style, onScene }: TwinCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const getStateRef = useRef(getState)
  const onSceneRef = useRef(onScene)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getStateRef.current = getState
    onSceneRef.current = onScene
  })

  useEffect(() => {
    if (!containerRef.current) return
    let scene: TwinScene
    try {
      scene = new TwinScene(containerRef.current, form, () => getStateRef.current())
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
  }, [form])

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
