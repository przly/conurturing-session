import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ScreenProps {
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/** Centred text page used between rounds. Focuses its heading on mount. */
export function Screen({ title, description, children, className }: ScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])

  return (
    <main className={cn('mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-4 py-10 sm:px-6', className)}>
      <div className="flex flex-col gap-2">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-balance font-semibold text-2xl tracking-tight outline-none sm:text-3xl"
        >
          {title}
        </h1>
        {description && <div className="text-pretty text-muted-foreground">{description}</div>}
      </div>
      {children}
    </main>
  )
}
