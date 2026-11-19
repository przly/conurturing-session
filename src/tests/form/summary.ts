import { LIKERT_ITEMS, LIKERT_MAX, LIKERT_MIN } from './questions'
import type { ExportData, StoredEvent } from '@/shared/data/export'

// ─── Derived metrics ─────────────────────────────────────────

export interface SummaryRow {
  session_id: string
  participant_code: string | null
  order_ab: string | null
  imagined_person: string | null
  round: number
  form: string | null
  completed: boolean
  talk_count: number
  talk_total_sec: number
  talk_before_wither_sec: number
  talk_after_wither_sec: number
  wither_start_t: number | null
  first_talk_after_wither_t: number | null
  /** Seconds from wither start to the first talk. */
  latency_first_talk_sec: number | null
  revived_t: number | null
  /** Seconds from wither start until health ≥ reviveThreshold (empty if never). */
  time_to_revive_sec: number | null
  mean_health: number | null
  end_health: number | null
  manual_overrides: number
  [likert: string]: string | number | boolean | null
  /** Mean of the Likert items (reverse items flipped). */
  likert_mean: number | null
  take_home: string | null
  chose_this_form: boolean | null
}

const r3 = (x: number) => Math.round(x * 1000) / 1000

export function summariseForm(data: ExportData): SummaryRow[] {
  const rows: SummaryRow[] = []
  for (const session of data.sessions) {
    if ((session.test_type ?? 'form') !== 'form') continue
    const sessionEvents = data.events.filter((e) => e.session_id === session.id)
    const sessionAnswers = data.answers.filter((a) => a.session_id === session.id)
    const takeHome = sessionAnswers.find((a) => a.round === 0 && a.question_id === 'take_home')?.value ?? null

    for (const round of [1, 2]) {
      let events = sessionEvents.filter((e) => e.round === round).sort((a, b) => a.id - b.id)
      // A restarted round: only keep events from the last start.
      const lastStart = events.map((e) => e.type).lastIndexOf('round_start')
      if (lastStart > 0) events = events.slice(lastStart)
      const form = events.find((e) => e.form)?.form ?? sessionAnswers.find((a) => a.round === round)?.form ?? null

      const talks = events.filter((e) => e.type === 'talk')
      const wither = events.find((e) => e.type === 'wither_start')
      const witherT = wither?.t_sec ?? null
      const firstTalk = witherT === null ? undefined : talks.find((t) => (t.t_sec ?? 0) >= witherT)
      const revived = events.find((e) => e.type === 'revived')
      const health = events.filter((e) => e.type === 'health' && e.health !== null).map((e) => e.health!)
      const sumTalk = (list: StoredEvent[]) => r3(list.reduce((s, t) => s + (t.duration_sec ?? 0), 0))

      const row: SummaryRow = {
        session_id: session.id,
        participant_code: session.participant_code,
        order_ab: session.order_ab,
        imagined_person: session.imagined_person,
        round,
        form,
        completed: events.some((e) => e.type === 'round_end' && !(e.meta as { restarted?: boolean })?.restarted),
        talk_count: talks.length,
        talk_total_sec: sumTalk(talks),
        talk_before_wither_sec: sumTalk(talks.filter((t) => witherT === null || (t.t_sec ?? 0) < witherT)),
        talk_after_wither_sec: sumTalk(talks.filter((t) => witherT !== null && (t.t_sec ?? 0) >= witherT)),
        wither_start_t: witherT,
        first_talk_after_wither_t: firstTalk?.t_sec ?? null,
        latency_first_talk_sec: firstTalk && witherT !== null ? r3(firstTalk.t_sec! - witherT) : null,
        revived_t: revived?.t_sec ?? null,
        time_to_revive_sec: revived && witherT !== null ? r3(revived.t_sec! - witherT) : null,
        mean_health: health.length ? r3(health.reduce((a, b) => a + b, 0) / health.length) : null,
        end_health: health.length ? health[health.length - 1] : null,
        manual_overrides: events.filter((e) => (e.meta as { source?: string })?.source === 'manual').length,
        likert_mean: null,
        take_home: takeHome,
        chose_this_form: takeHome && form ? takeHome === form : null,
      }

      const scores: number[] = []
      for (const item of LIKERT_ITEMS) {
        const raw = sessionAnswers.find((a) => a.round === round && a.question_id === item.id)?.value
        const value = raw ? Number(raw) : null
        row[`likert_${item.id}`] = value
        if (value !== null && Number.isFinite(value)) {
          scores.push(item.reverse ? LIKERT_MAX + LIKERT_MIN - value : value)
        }
      }
      row.likert_mean = scores.length ? r3(scores.reduce((a, b) => a + b, 0) / scores.length) : null
      rows.push(row)
    }
  }
  return rows
}
