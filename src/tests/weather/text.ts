/**
 * ─────────────────────────────────────────────────────────────
 *  WEATHER TEST: participant-facing text
 * ─────────────────────────────────────────────────────────────
 *  Question `id`s are stored in `answers.question_id`; keep them
 *  stable once data collection starts. Wording can change freely.
 */
import type { WeatherCondition } from '@/config'
import type { SurveyItem } from '@/shared/survey/likert'

/** What the participant told us on the start screen. */
export interface Personal {
  familyName: string | null
  hometown: string | null
}

const family = (p: Personal) => p.familyName ?? 'your family'
const familyFirstPerson = (p: Personal) => p.familyName ?? 'my family'
const hometown = (p: Personal) => p.hometown ?? 'your hometown'

/** One-line framing shown before each condition (B and C add a second sentence). */
export function framing(condition: WeatherCondition, p: Personal): string[] {
  const lines = [`This is your plant. The shadow is ${family(p)} at home.`]
  if (condition === 'B') lines.push(`It also shows the weather in ${hometown(p)} right now.`)
  if (condition === 'C') lines.push('It also shows the weather here in Amsterdam right now.')
  return lines
}

/** 1–7 statements after each condition (the “home / me” circles come after these). */
export function likertItems(p: Personal): SurveyItem[] {
  return [
    { id: 'connected_home', text: 'I felt connected to home.' },
    { id: 'thought_of_home', text: `It made me think of ${familyFirstPerson(p)} or ${p.hometown ?? 'my hometown'}.` },
    { id: 'from_home', text: 'It felt like the plant was “from home”.' },
    { id: 'comforting', text: 'It felt comforting.' },
    { id: 'homesick', text: 'It made me feel homesick.' },
    { id: 'understood_reacting', text: 'I understood what the plant was reacting to.' },
  ]
}

export const START_TEXT = {
  title: 'Welcome',
  description: 'Thank you for taking part. The researcher will explain what happens next.',
  consent:
    'I have had the study explained to me and agree to take part. I know I can stop at any time without giving a reason.',
  hometownLabel: 'Where is home for you?',
  hometownHint: 'Start typing your hometown and pick it from the list. We use it to show the weather there.',
  familyLabel: 'Who from home would you miss the most?',
  familyHint: 'Optional. A first name or how you call them, for example “Mum” or “Ana”.',
  noMic: 'You won’t need to talk or do anything during the study. The page doesn’t use your microphone or camera.',
}

export const STUDY_TEXT = {
  introTitle: 'Introduction',
  introError: 'The introduction could not play. Try loading it again.',
  retry: 'Try again',
  continue: 'Continue',
  checkTitle: 'Quick question',
  checkQuestion: 'What happens to your family’s plant when you walk into your room?',
  checkExplanation: 'When you walk into your room, your family’s plant wakes up and glows.',
  replay: 'Replay the clip',
  checkOptions: [
    { id: 'glow', label: 'It wakes up and glows' },
    { id: 'nothing', label: 'Nothing happens' },
    { id: 'sound', label: 'It plays a sound' },
    { id: 'off', label: 'It turns off' },
  ],
  part: (position: number, total: number) => `Part ${position} of ${total}`,
  watch: (minutes: number) => `When you press Begin, the plant will appear for about ${minutes} minutes. Just watch. You don’t need to do anything.`,
  begin: 'Begin',
  presenceError: 'The shadow video could not play. Try loading it again.',
  surveyTitle: (position: number) => `Questions about part ${position}`,
  surveyDescription: 'Think about the plant you just watched. How much do you agree with each statement?',
  ios: 'Which picture best shows how connected you felt to home?',
  iosHome: 'home',
  iosMe: 'me',
  iosLabel: (point: number) => `Picture ${point} of 7, from least to most overlap`,
  missing: 'Please answer the highlighted questions.',
  finalTitle: 'Last questions',
  finalDescription: 'Think about the versions you just watched.',
  preferred: 'Which version would you want in your room abroad?',
  version: (n: number) => `Version ${n}`,
  colourChanges: 'What did the colour changes make you think about?',
  weatherHome: 'Did the weather make the presence feel more or less like home? Why?',
  finalMissing: 'Please answer all three questions.',
  finish: 'Finish',
}
