import { formatClock, WEATHER_CONFIG } from '@/config'
import type { LiveStatus } from '@/shared/data/live'
import type { ScriptStep } from '@/tests/form/researcherScript'

export const WEATHER_RESEARCHER_SCRIPT: ScriptStep[] = [
  {
    id: 'welcome',
    title: 'Welcome and consent',
    when: 'Before the participant starts',
    say: [
      'Thank you for taking part. You’ll watch a short video and several versions of a plant, then answer a few questions.',
      'Taking part is voluntary. You can stop at any time without giving a reason. The study uses prerecorded videos and does not access your microphone or camera.',
      'Please read the consent statement. If you agree, select your hometown. You can also enter how you address someone close to you at home. Press Start when you’re ready.',
    ],
    notes: ['Wait for consent. Plug the laptop in and turn off notifications.'],
    match: { phases: ['start'] },
  },
  {
    id: 'intro',
    title: 'Watch the introduction',
    when: 'While the introduction loads',
    say: ['You can watch the introduction or skip it. If you watch to the end, press Continue.'],
    match: { phases: ['intro'] },
  },
  {
    id: 'check',
    title: 'Check understanding',
    when: 'After the introduction',
    say: ['Please answer the question on screen. If offered, you can replay the video or continue.'],
    match: { phases: ['check'] },
  },
  {
    id: 'between',
    title: 'Start the next part',
    when: 'Before each viewing',
    say: ['Read the text on screen. When you’re ready, press Begin and watch the plant.'],
    notes: ['Use the same wording every time. Let the on-screen framing introduce each version.'],
    match: { phases: ['between'] },
  },
  {
    id: 'round',
    title: 'Viewing',
    when: 'While the plant is on screen',
    say: [],
    notes: ['Let the participant watch quietly until the questions appear.'],
    match: { phases: ['round'] },
  },
  {
    id: 'survey',
    title: 'Questions about this part',
    when: 'After each viewing',
    say: ['Answer based on the version you just watched. Choose the picture that best represents how you felt.'],
    match: { phases: ['survey'] },
  },
  {
    id: 'final',
    title: 'Final questions',
    when: 'After the last survey',
    say: ['Think about all the versions you saw and answer the final questions in your own words.'],
    match: { phases: ['final'] },
  },
  {
    id: 'done',
    title: 'Thank the participant',
    when: 'On the thank-you screen',
    say: ['Thank you for taking part. Do you have any questions before we finish?'],
    notes: ['Check that the data is saved before closing the participant page.'],
    match: { phases: ['done'] },
  },
]

export function nextWeatherStep(stepId: string, position: number | null, total: number) {
  if (stepId === 'survey' && (position ?? 0) < total) {
    return WEATHER_RESEARCHER_SCRIPT.find((step) => step.id === 'between') ?? null
  }
  const index = WEATHER_RESEARCHER_SCRIPT.findIndex((step) => step.id === stepId)
  return index < 0 ? null : WEATHER_RESEARCHER_SCRIPT[index + 1] ?? null
}

export function describeWeather(status: LiveStatus) {
  if (status.phase === 'between') return `Ready screen, before part ${(status.round ?? 0) + 1}`
  if (status.phase === 'round') return `Part ${status.round} · ${formatClock(status.t ?? 0)} / ${formatClock(WEATHER_CONFIG.conditionSec)}`
  if (status.phase === 'survey') return `Questions after part ${status.round}`
  return WEATHER_RESEARCHER_SCRIPT.find((step) => step.match?.phases.includes(status.phase))?.title ?? status.phase
}
