/**
 * ─────────────────────────────────────────────────────────────
 *  SAMPLE SURVEY CONTENT — PLACEHOLDER, REPLACE BEFORE USE
 * ─────────────────────────────────────────────────────────────
 *  The final research topic and wording are not set yet.
 *  Edit the questions and answers below; the survey flow reads
 *  everything from this file.
 *
 *  - `id` links a question to its 3D reaction in
 *    `src/scene/reactions.ts`. Keep ids stable (or update both files).
 *  - Each question needs exactly four options, keyed A–D.
 */

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const
export type OptionKey = (typeof OPTION_KEYS)[number]

export interface SurveyQuestion {
  id: string
  prompt: string
  /** Optional one-line hint shown under the question. */
  helper?: string
  options: Record<OptionKey, string>
}

export interface SurveyContent {
  /** Set to false once the real survey content is in place. */
  isSample: boolean
  /** Saved with every response. Change it whenever you edit questions, so results can be told apart. */
  version: string
  title: string
  intro: string
  questions: SurveyQuestion[]
}

export const survey: SurveyContent = {
  isSample: true,
  version: 'sample-1',
  title: 'Using university study spaces',
  intro:
    'A short sample survey about how students find and use study spaces on campus.',
  questions: [
    {
      id: 'frequency',
      prompt: 'How often do you use a university study space?',
      helper: 'Think about a typical week during the teaching period.',
      options: {
        A: 'Every day',
        B: 'A few times a week',
        C: 'A few times a month',
        D: 'Rarely or never',
      },
    },
    {
      id: 'priority',
      prompt: 'What matters most to you when choosing where to study?',
      options: {
        A: 'Quiet and few distractions',
        B: 'Power outlets and reliable Wi-Fi',
        C: 'Natural light and a pleasant view',
        D: 'Being close to classmates or friends',
      },
    },
    {
      id: 'availability',
      prompt: 'How easy is it to find an available seat at busy times?',
      options: {
        A: 'Very easy',
        B: 'Somewhat easy',
        C: 'Somewhat difficult',
        D: 'Very difficult',
      },
    },
    {
      id: 'improvement',
      prompt: 'Which change would improve study spaces most for you?',
      options: {
        A: 'More seats overall',
        B: 'Longer opening hours',
        C: 'Bookable group rooms',
        D: 'More comfortable furniture',
      },
    },
  ],
}
