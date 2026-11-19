import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SPEED } from '@/config'
import { Screen } from '@/shared/components/Screen'
import { STUDY_TEXT as copy } from '../text'

interface IntroScreenProps {
  onStart: () => void
  onEnd: (watched: number) => void
  onContinue: () => void
}

export function IntroScreen({ onStart, onEnd, onContinue }: IntroScreenProps) {
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  const [started, setStarted] = useState(false)
  const [attempt, setAttempt] = useState(0)

  return (
    <div className="fixed inset-0 bg-black">
      <video
        key={attempt}
        src="/videos/intro.mp4"
        className="size-full object-contain"
        aria-label={copy.introTitle}
        muted
        playsInline
        autoPlay
        onLoadedMetadata={(e) => { e.currentTarget.playbackRate = SPEED }}
        onPlaying={() => {
          if (started) return
          setStarted(true)
          onStart()
        }}
        onEnded={(e) => {
          setDone(true)
          const watched = e.currentTarget.played
          let seconds = 0
          for (let i = 0; i < watched.length; i++) seconds += watched.end(i) - watched.start(i)
          onEnd(seconds)
        }}
        onError={() => setFailed(true)}
      />
      {done && <Button size="lg" className="absolute bottom-6 left-1/2 -translate-x-1/2" onClick={onContinue}>{copy.continue}</Button>}
      {failed && (
        <div className="absolute inset-0 bg-background">
          <Screen title={copy.introTitle} description={copy.introError}>
            <Button className="self-start" onClick={() => { setFailed(false); setAttempt(attempt + 1) }}>{copy.retry}</Button>
          </Screen>
        </div>
      )}
    </div>
  )
}
