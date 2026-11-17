/**
 * ─────────────────────────────────────────────────────────────
 *  3D REACTION CONFIG — PLACEHOLDER REACTIONS, REPLACE LATER
 * ─────────────────────────────────────────────────────────────
 *  How the 3D flower responds to each question and answer.
 *  `color` tints the petals; `spin` turns the flower head.
 *
 *  For every question id (see `src/survey/surveyContent.ts`):
 *   - `base`    is the pose shown when the question first appears.
 *   - `answers` holds optional overrides per answer A–D. Only the
 *               fields you list change; the rest come from `base`.
 *
 *  The scene smoothly eases toward the resolved pose. With
 *  reduced motion it jumps straight there and spin/bob are off.
 *
 *  To add a new kind of reaction, add a field to `Reaction`,
 *  give it a default in `DEFAULT_REACTION`, and read it in
 *  `src/scene/SurveyScene.ts` (`applyTarget` + `tick`).
 */

import type { OptionKey } from '@/survey/surveyContent'

export interface Reaction {
  /** Petal colour (any CSS hex). */
  color: string
  /** Uniform size multiplier. 1 = default. Keep within ~0.6–1.4. */
  scale: number
  /** Continuous turn of the flower head, radians per second. 0 = still. */
  spin: number
  /** Static lean from the stem base, in degrees: [toward/away from viewer (+/−), left/right (+/−)]. */
  tilt: [number, number]
  /** Vertical offset in scene units. 0 = resting on the floor shadow. */
  lift: number
  /** Gentle float amplitude in scene units. 0 = none. */
  bob: number
  /** Plain-language description, read out by screen readers. */
  description: string
}

type ReactionPatch = Partial<Reaction>

export interface QuestionReaction {
  base: ReactionPatch
  answers?: Partial<Record<OptionKey, ReactionPatch>>
}

export const DEFAULT_REACTION: Reaction = {
  color: '#5b6b8c',
  scale: 1,
  spin: 0.25,
  tilt: [0, 0],
  lift: 0,
  bob: 0,
  description: 'A flower standing upright, its head turning slowly.',
}

export const reactions: Record<string, QuestionReaction> = {
  // Placeholder idea: how often → how fast the object turns.
  frequency: {
    base: { color: '#5b6b8c', spin: 0.2 },
    answers: {
      A: { spin: 1.6, description: 'The flower turns quickly.' },
      B: { spin: 0.9, description: 'The flower turns at a steady pace.' },
      C: { spin: 0.4, description: 'The flower turns slowly.' },
      D: { spin: 0, description: 'The flower stands still.' },
    },
  },

  // Placeholder idea: what matters most → colour.
  priority: {
    base: { color: '#6b7280', spin: 0.25 },
    answers: {
      A: { color: '#3f5a8a', description: 'The petals turn deep blue.' },
      B: { color: '#2f7d74', description: 'The petals turn teal.' },
      C: { color: '#b7862f', description: 'The petals turn warm amber.' },
      D: { color: '#9a4f63', description: 'The petals turn muted rose.' },
    },
  },

  // Placeholder idea: ease of finding a seat → size.
  // (`lift` and `bob` are also available here if you want the flower to rise or float.)
  availability: {
    base: { color: '#b5674d', spin: 0.2, scale: 1 },
    answers: {
      A: { scale: 1.3, description: 'The flower grows tall.' },
      B: { scale: 1.12, description: 'The flower grows slightly.' },
      C: { scale: 0.85, description: 'The flower shrinks slightly.' },
      D: { scale: 0.65, spin: 0, description: 'The flower shrinks and stops turning.' },
    },
  },

  // Placeholder idea: preferred improvement → which way it leans.
  improvement: {
    base: { color: '#6a5a86', spin: 0.25 },
    answers: {
      A: { tilt: [18, 0], description: 'The flower leans toward you.' },
      B: { tilt: [-18, 0], description: 'The flower leans away from you.' },
      C: { tilt: [0, 18], description: 'The flower leans to the left.' },
      D: { tilt: [0, -18], description: 'The flower leans to the right.' },
    },
  },
}

/** Resolve the full pose for a question and (optional) selected answer. */
export function resolveReaction(questionId: string, answer?: OptionKey): Reaction {
  const config = reactions[questionId]
  if (!config) return DEFAULT_REACTION
  return {
    ...DEFAULT_REACTION,
    ...config.base,
    ...(answer ? config.answers?.[answer] : undefined),
  }
}
