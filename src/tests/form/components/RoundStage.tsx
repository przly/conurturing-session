import { useEffect, useState } from 'react'
import { PRESENTATION, ROUND_CONFIG, URL_PARAMS, type Form } from '@/config'
import { RoundCountdown } from '@/shared/components/RoundCountdown'
import { TwinCanvas } from '@/shared/components/TwinCanvas'
import { DebugOverlay } from '@/tests/form/components/DebugOverlay'
import type { TwinScene } from '@/shared/scene/TwinScene'
import type { StudySession } from '@/tests/form/StudySession'

interface RoundStageProps {
  session: StudySession
  form: Form
  /** True once the round has ended; triggers the fade out. */
  ending: boolean
  onFadedOut: () => void
}

/** Full-screen round with the object and a countdown. */
export function RoundStage({ session, form, ending, onFadedOut }: RoundStageProps) {
  const [visible, setVisible] = useState(false)
  const [scene, setScene] = useState<TwinScene | null>(null)

  // Fade in on the next frame, so the transition runs.
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (!ending) return
    setVisible(false)
    const id = setTimeout(onFadedOut, PRESENTATION.fadeOutSec * 1000)
    return () => clearTimeout(id)
  }, [ending, onFadedOut])

  const fade = visible ? PRESENTATION.fadeInSec : PRESENTATION.fadeOutSec

  return (
    <div className="fixed inset-0 cursor-none bg-[#0d0e11]">
      <TwinCanvas
        form={form}
        getState={() => session.state}
        onScene={setScene}
        style={{ opacity: visible ? 1 : 0, transition: `opacity ${fade}s ease-in-out` }}
      />
      <RoundCountdown ending={ending} readRemaining={() => ROUND_CONFIG.durationSec - (session.runner?.t ?? 0)} />
      {URL_PARAMS.debug && (
        <div className="cursor-auto">
          <DebugOverlay session={session} scene={scene} />
        </div>
      )}
    </div>
  )
}
