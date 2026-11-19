import { supabase } from './supabase'

export interface SessionRow {
  id: string
  participant_code: string | null
  test_type: 'form' | 'weather'
  order_ab: string | null
  imagined_person: string | null
  condition_order: string | null
  clip_assignment: string | null
  clip3_offset_sec: number | null
  include_c: boolean
  hometown_name: string | null
  hometown_lat: number | null
  hometown_lon: number | null
  family_name: string | null
  started_at: string | null
  created_at: string
  /** From the `session_overview` view (admin list only, not in exports). */
  current_round?: number | null
  completed?: boolean
  weather_failed?: boolean
}

export interface StoredEvent {
  id: number
  session_id: string
  round: number | null
  form: string | null
  condition: string | null
  type: string
  t_sec: number | null
  duration_sec: number | null
  health: number | null
  meta: Record<string, unknown> | null
  created_at: string
}

export interface StoredAnswer {
  id: number
  session_id: string
  round: number
  form: string | null
  condition: string | null
  question_id: string
  value: string | null
  created_at: string
}

export interface ExportData {
  sessions: SessionRow[]
  events: StoredEvent[]
  answers: StoredAnswer[]
}

const PAGE = 1000

/** Supabase returns at most 1000 rows per request, so page through. */
async function fetchAll<T>(table: string, sessionIds?: string[]): Promise<T[]> {
  if (!supabase) throw new Error('Supabase is not configured')
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select('*').order(table === 'sessions' ? 'created_at' : 'id').range(from, from + PAGE - 1)
    if (sessionIds) query = query.in(table === 'sessions' ? 'id' : 'session_id', sessionIds)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data as T[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export async function fetchExport(sessionIds?: string[]): Promise<ExportData> {
  const [sessions, events, answers] = await Promise.all([
    fetchAll<SessionRow>('sessions', sessionIds),
    fetchAll<StoredEvent>('events', sessionIds),
    fetchAll<StoredAnswer>('answers', sessionIds),
  ])
  return { sessions, events, answers }
}

// ─── Files ───────────────────────────────────────────────────

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return ''
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n')
}

export function download(filename: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Turns raw rows into one derived row per session × round/condition (test-specific). */
export type Summariser = (data: ExportData) => Record<string, unknown>[]

export function downloadExport(data: ExportData, name: string, format: 'json' | 'csv', summarise: Summariser) {
  const summary = summarise(data)
  if (format === 'json') {
    download(`${name}.json`, JSON.stringify({ ...data, summary }, null, 2), 'application/json')
    return
  }
  download(`${name}-summary.csv`, toCSV(summary), 'text/csv')
  download(`${name}-events.csv`, toCSV(data.events as unknown as Record<string, unknown>[]), 'text/csv')
  download(`${name}-answers.csv`, toCSV(data.answers as unknown as Record<string, unknown>[]), 'text/csv')
  download(`${name}-sessions.csv`, toCSV(data.sessions as unknown as Record<string, unknown>[]), 'text/csv')
}
