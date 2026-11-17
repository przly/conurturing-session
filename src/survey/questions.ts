/**
 * Questionnaire content. `id`s are what's stored in `answers.question_id`;
 * keep them stable once data collection starts.
 */

export interface LikertItem {
  id: string
  text: (imaginedPerson: string | null) => string
  /** Reverse-scored item (score = 8 − value in the export summary). */
  reverse?: boolean
}

export const LIKERT_MIN = 1
export const LIKERT_MAX = 7
export const LIKERT_LABELS = { min: 'Strongly disagree', max: 'Strongly agree' }

export const LIKERT_ITEMS: LikertItem[] = [
  { id: 'responsible', text: () => "I felt responsible for this object's wellbeing." },
  { id: 'bad_when_fading', text: () => 'I felt bad when it started to fade.' },
  { id: 'felt_alive', text: () => 'It felt alive.' },
  {
    id: 'thought_of_person',
    text: (name) => (name ? `It made me think of ${name}.` : 'It made me think of the person who has its twin.'),
  },
  { id: 'enjoyed_talking', text: () => 'I enjoyed talking to it.' },
  { id: 'talking_awkward', text: () => 'Talking to it felt awkward.', reverse: true },
  { id: 'want_in_room', text: () => 'I would want this in my room.' },
]

export const FINAL_QUESTIONS = {
  takeHome: { id: 'take_home', text: 'You can take one home for a month. Which one?' },
  why: { id: 'take_home_why', text: 'Why?' },
  fade: { id: 'fade_feeling', text: 'How did it feel when each one started to fade?' },
}

export const FORM_LABELS = { plant: 'The plant', orb: 'The orb' } as const
