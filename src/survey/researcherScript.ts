/**
 * ─────────────────────────────────────────────────────────────
 *  RESEARCHER SCRIPT: read aloud during a session
 * ─────────────────────────────────────────────────────────────
 *  Shown in the admin panel (`?admin=1`). Edit the wording here.
 *
 *  - `say`:   paragraphs to read out loud, word for word.
 *  - `notes`: for you only, not read out.
 *  - `match`: which participant screen this step belongs to, so the
 *             admin panel can highlight it while a session is live.
 *
 *  Keep the wording identical for both forms: say "object", never
 *  "plant" or "orb", before the debrief. Otherwise the framing
 *  itself favours one form.
 */
import type { Phase } from '@/data/live'

export interface ScriptStep {
  id: string
  title: string
  /** When to read it. */
  when: string
  say: string[]
  notes?: string[]
  /** Participant phase(s) this step belongs to; `round` = the last round started (null before round 1). */
  match?: { phases: Phase[]; round?: number | null }
}

export const RESEARCHER_SCRIPT: ScriptStep[] = [
  {
    id: 'welcome',
    title: 'Welcome and consent',
    when: 'Before the participant starts, with the start screen open',
    say: [
      'Thank you for taking part. This session takes about 30 minutes.',
      'We are a group of design students working on ways to help students who live abroad feel more at home.',
      'Taking part is voluntary. You can stop at any moment without giving a reason, and that is completely fine.',
      'The page uses the microphone only to notice when you are speaking. No sound is recorded, stored or sent anywhere. We only save when you spoke and for how long, plus your answers to a few questions. Everything is stored under a code, not your name.',
      'Do you have any questions so far? Are you OK to take part?',
    ],
    notes: [
      'Wait for a clear yes before continuing. If they decline, stop here.',
      'Laptop plugged in, screen brightness up, notifications off.',
    ],
    match: { phases: ['start'] },
  },
  {
    id: 'concept',
    title: 'The idea',
    when: 'Right after consent, still on the start screen',
    say: [
      'Imagine you have moved abroad to study. You have a small object in your room, and it has a twin. The twin stays at home with someone close to you.',
      'Talking to your object gives it energy. It does not send your voice, only the fact that you spoke. When someone talks to the twin at home, your object reacts too.',
      'If nobody talks to it for a while, it slowly loses energy.',
      'Think of one person who would have the other twin, someone you would miss. If you like, you can type who that is in the box on the screen. It is optional.',
      'When you are ready, press Start.',
    ],
    notes: [
      'Say "object" here, not "plant": the participant meets both forms with the same framing.',
      'Do not explain what the object looks like or how it reacts beyond this.',
    ],
    match: { phases: ['start'] },
  },
  {
    id: 'calibration',
    title: 'Microphone check',
    when: 'On the "Microphone check" screen',
    say: [
      'First the page checks the microphone. Press "Turn on microphone" and allow access if the browser asks.',
      'It will ask you to stay quiet for a few seconds, and then to read a sentence out loud at your normal speaking volume.',
    ],
    notes: [
      'Stay quiet yourself during the silence part.',
      'If it says it could not hear them clearly, ask them to move a bit closer and press "Check again".',
      'If it says "Microphone needed": allow the microphone for this site (the screen shows how for Chrome and Safari), then reload. The page goes back to Start; that is fine, use the same link.',
    ],
    match: { phases: ['calibrate'] },
  },
  {
    id: 'round-1',
    title: 'Before round 1',
    when: 'On the "Ready when you are" screen',
    say: [
      'In a moment an object will appear on the screen, and it will stay for about 10 minutes.',
      'Imagine this is the object in your room, and its twin is with the person you thought of. Treat it however you like: you can talk to it as much or as little as you want. There is no right or wrong way.',
      'I will stay in the room and sit quietly to the side. Just act as if I am not here. The screen will tell you when the time is up.',
      'Press Begin when you are ready.',
    ],
    notes: [
      'Sit to the side or slightly behind them, out of their line of sight, not facing the screen together with them.',
      'Do not talk during the round: the microphone would pick up your voice and count it as their talking.',
    ],
    match: { phases: ['between'], round: null },
  },
  {
    id: 'during-round',
    title: 'During a round',
    when: 'While the object is on screen (10 minutes)',
    say: [],
    notes: [
      'Stay quiet, keep still and avoid reacting to what happens on screen (no nodding, smiling or sighing).',
      'Take observation notes on paper, silently (no typing: the keyboard is audible).',
      'Watch the live view: health should rise when they talk. Pulses come at 2:00, 5:00 and 8:00, and the forced fade at 6:00.',
      'Only use the overrides if something clearly went wrong. They are logged as manual.',
      'If the participant asks something, answer briefly, quietly and neutrally: "Do whatever feels natural." Then go quiet again.',
      'When the screen fades out and says "Round complete", go to the next step.',
      'If they want to stop: that is fine. Thank them, do the debrief (step 9), and ask whether they want their data deleted.',
    ],
    match: { phases: ['round'] },
  },
  {
    id: 'after-round',
    title: 'After a round',
    when: 'On "Round complete" and the questions',
    say: [
      'Thank you. Please answer a few short questions about the object you just spent time with. There are no right or wrong answers. Go with your first feeling.',
    ],
    notes: ['Do not comment on the object or on how much they talked.'],
    match: { phases: ['round-done', 'survey'] },
  },
  {
    id: 'round-2',
    title: 'Before round 2',
    when: 'On the "Part 2 of 2" screen',
    say: [
      'Next a different object will appear, again for about 10 minutes.',
      'Same as before: it is in your room, and its twin is with the same person. You can talk to it as much or as little as you want.',
      'Press Begin when you are ready.',
    ],
    notes: ['Use the same tone, and sit in the same place as in round 1.'],
    match: { phases: ['between'], round: 1 },
  },
  {
    id: 'final',
    title: 'Last questions',
    when: 'On the "Last questions" screen',
    say: ['Now a few last questions about both objects. Take your time with the written answers.'],
    match: { phases: ['final'] },
  },
  {
    id: 'debrief',
    title: 'Debrief',
    when: 'After the "Thank you" screen says everything is saved',
    say: [
      'Thank you, that was everything. Now I can tell you a bit more about the study.',
      'We were comparing two shapes, a plant and an orb, that behaved in exactly the same way. We want to know whether the shape changes how attached people feel to it.',
      'The partner at home was not a real person. Their signals came at fixed times, the same for everyone. The object also faded at a fixed moment in every session, no matter how much you talked. So that was not because of anything you did.',
      'Please do not tell other possible participants about this, so their sessions stay the same as yours.',
      'Are you still OK with us using your data? If not, we will delete it now. Do you have any questions?',
    ],
    notes: [
      'If they withdraw: select their session in the admin panel and click "Delete session".',
      'Check that the done screen says "Everything is saved" before closing the tab.',
      'If it says "Still trying to save": keep the tab open and check the internet connection; it retries by itself. "Unsaved rows" in the live view should drop to 0. If it stays stuck, click "Download data" on that screen and keep the file.',
    ],
    match: { phases: ['done'] },
  },
]

/** The step that matches the participant's live phase, if any. */
export function currentStepIds(phase: Phase, round: number | null): string[] {
  return RESEARCHER_SCRIPT.filter((step) => {
    const m = step.match
    if (!m || !m.phases.includes(phase)) return false
    return m.round === undefined || m.round === (round ?? null)
  }).map((step) => step.id)
}

/**
 * The step that comes after `stepId`. Rounds repeat, so after round 2 the
 * flow goes back to "During a round", and after the round-2 questions to the
 * last questions. `round` = the last round started (null before round 1).
 */
export function nextStep(stepId: string, round: number | null): ScriptStep | null {
  const byId = (id: string) => RESEARCHER_SCRIPT.find((step) => step.id === id) ?? null
  if (stepId === 'round-2') return byId('during-round')
  if (stepId === 'after-round') return byId(round === 2 ? 'final' : 'round-2')
  const index = RESEARCHER_SCRIPT.findIndex((step) => step.id === stepId)
  return index >= 0 ? (RESEARCHER_SCRIPT[index + 1] ?? null) : null
}
