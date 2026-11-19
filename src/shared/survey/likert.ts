/** 1–7 agreement scale shared by both tests. */
export const LIKERT_MIN = 1
export const LIKERT_MAX = 7
export const LIKERT_LABELS = { min: 'Strongly disagree', max: 'Strongly agree' }

/** "(1 = strongly disagree, 7 = strongly agree)" */
export const SCALE_HINT = `(${LIKERT_MIN} = ${LIKERT_LABELS.min.toLowerCase()}, ${LIKERT_MAX} = ${LIKERT_LABELS.max.toLowerCase()})`

/** One statement, with its text already filled in for this participant. */
export interface SurveyItem {
  /** Stored in `answers.question_id`; keep stable once data collection starts. */
  id: string
  text: string
}
