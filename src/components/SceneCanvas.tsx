import { useEffect, useId, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import type { Reaction } from '@/scene/reactions'
import { SurveyScene } from '@/scene/SurveyScene'
import { cn } from '@/lib/utils'

interface SceneCanvasProps {
  reaction: Reaction
  className?: string
}

/** React wrapper around the imperative Three.js scene. */
export function SceneCanvas({ reaction, className }: SceneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<SurveyScene | null>(null)
  const [webglFailed, setWebglFailed] = useState(false)
  const reducedMotion = useReducedMotion() ?? false
  const captionId = useId()

  useEffect(() => {
    if (!containerRef.current) return
    try {
      sceneRef.current = new SurveyScene(containerRef.current)
    } catch {
      setWebglFailed(true)
      return
    }
    return () => {
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setReducedMotion(reducedMotion)
  }, [reducedMotion])

  useEffect(() => {
    sceneRef.current?.setReaction(reaction)
  }, [reaction])

  return (
    <figure
      className={cn(
        'relative overflow-hidden rounded-xl border bg-muted/60',
        className,
      )}
    >
      <div
        ref={containerRef}
        role="img"
        aria-label="3D reaction preview"
        aria-describedby={captionId}
        className="h-72 w-full sm:h-96"
      >
        {webglFailed && (
          <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground text-sm">
            3D preview unavailable in this browser.
          </div>
        )}
      </div>
      {/* Visible, announced caption so the reaction is understandable without the 3D view. */}
      <figcaption
        id={captionId}
        aria-live="polite"
        className="border-t bg-background/70 px-4 py-2 text-muted-foreground text-xs"
      >
        {reaction.description}
      </figcaption>
    </figure>
  )
}
