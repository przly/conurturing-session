import type { Summariser } from '@/shared/data/export'
import { likertItems } from './text'

const questions = [...likertItems({ familyName: null, hometown: null }).map(({ id }) => id), 'ios']

export const summariseWeather: Summariser = ({ sessions, events, answers }) =>
  sessions.filter((session) => session.test_type === 'weather').flatMap((session) => {
    const sessionEvents = events.filter((event) => event.session_id === session.id)
    const sessionAnswers = answers.filter((answer) => answer.session_id === session.id)
    const checks = sessionEvents.filter((event) => event.type === 'comprehension_answer')
    const final = Object.fromEntries(sessionAnswers.filter(({ round }) => round === 0).map(({ question_id, value }) => [question_id, value]))
    const conditions = (session.condition_order ?? (session.include_c ? 'A,B,C' : 'A,B')).split(',')
    const clips = (session.clip_assignment ?? '').split(',')

    return conditions.map((condition, index) => {
      const position = index + 1
      const partEvents = sessionEvents.filter((event) => event.round === position)
      const start = partEvents.find((event) => event.type === 'condition_start')?.meta
      const weather = partEvents.find((event) => event.type === 'weather_state')?.meta
      const changes = partEvents.filter((event) => event.type === 'weather_transition' && event.meta?.source === 'script')
      const responses = Object.fromEntries(sessionAnswers.filter(({ round }) => round === position).map(({ question_id, value }) => [question_id, value]))

      return {
        session_id: session.id,
        participant_code: session.participant_code,
        test_type: session.test_type,
        position,
        condition,
        clip: start?.clip ?? (clips[index] ? Number(clips[index]) : index % 2 + 1),
        clip_offset_sec: start?.clip_offset_sec ?? (position === 3 ? session.clip3_offset_sec : 0),
        weather_source: weather?.source ?? null,
        weather_state: weather?.to ?? null,
        weather_code: weather?.code ?? null,
        weather_temperature: weather?.temperature ?? null,
        weather_is_day: weather?.is_day ?? null,
        weather_fetch_failed: partEvents.some((event) => event.type === 'weather_fetch_failed'),
        first_change_at_sec: changes[0]?.t_sec ?? null,
        first_change_shift_sec: changes[0]?.meta?.shift ?? null,
        second_change_at_sec: changes[1]?.t_sec ?? null,
        second_change_shift_sec: changes[1]?.meta?.shift ?? null,
        ...Object.fromEntries(questions.map((id) => [id, responses[id] ?? null])),
        comprehension_correct: checks.at(-1)?.meta?.correct ?? null,
        comprehension_attempts: checks.length,
        preferred_condition: final.preferred_condition ?? null,
        preferred_version: final.preferred_version ?? null,
        is_preferred: final.preferred_condition == null ? null : final.preferred_condition === condition,
        colour_changes: final.colour_changes ?? null,
        weather_home: final.weather_home ?? null,
      }
    })
  })
