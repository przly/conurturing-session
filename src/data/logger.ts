import { supabase } from './supabase'
import type { Form, Order } from '@/config'

export interface EventRow {
  session_id: string
  round: number
  form: Form | null
  type: string
  t_sec: number | null
  duration_sec?: number | null
  health?: number | null
  meta?: Record<string, unknown> | null
}

export interface AnswerRow {
  session_id: string
  round: number
  form: Form | null
  question_id: string
  value: string
}

interface StartArgs {
  p_id: string
  p_code: string | null
  p_order: Order | null
  p_imagined: string | null
}

type QueueItem =
  | { kind: 'start'; args: StartArgs }
  | { kind: 'event'; row: EventRow }
  | { kind: 'answer'; row: AnswerRow }

const FLUSH_MS = 3000
const BATCH = 500
const START_TIMEOUT_MS = 6000

/**
 * Buffers events and answers and writes them to Supabase in batches.
 * Unsent items are kept in localStorage, so a dropped connection or a
 * page reload doesn't lose data; they are retried until saved.
 * Without Supabase configured, everything is kept locally for download.
 */
export class SessionLogger {
  readonly online = supabase !== null
  /** Everything logged this page load (for local download / debugging). */
  readonly archive: { events: EventRow[]; answers: AnswerRow[] } = { events: [], answers: [] }
  lastError: string | null = null
  onChange: (() => void) | null = null

  private queue: QueueItem[]
  private storageKey: string
  private timer = 0
  private flushing = false

  constructor(sessionId: string) {
    this.storageKey = `twin-queue:${sessionId}`
    this.queue = this.load()
  }

  get pending() {
    return this.online ? this.queue.length : 0
  }

  dispose() {
    clearInterval(this.timer)
    window.removeEventListener('online', this.flushSoon)
  }

  /**
   * Registers the session and returns the order stored for it (or null if
   * offline / not configured). Retried in the background if it fails.
   */
  async startSession(args: StartArgs): Promise<Order | null> {
    if (!supabase) return null
    // Background saving starts here (not in the constructor, so a discarded instance never runs).
    if (!this.timer) {
      this.timer = window.setInterval(() => void this.flush(), FLUSH_MS)
      window.addEventListener('online', this.flushSoon)
      void this.flush() // anything left over from a reload
    }
    try {
      const call = supabase.rpc('start_session', args)
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), START_TIMEOUT_MS),
      )
      const { data, error } = await Promise.race([call, timeout])
      if (error) throw error
      return data as Order
    } catch (error) {
      console.warn('start_session failed; will retry in the background', error)
      this.lastError = String((error as Error)?.message ?? error)
      // Must reach the database before any events (foreign key).
      this.queue.unshift({ kind: 'start', args })
      this.save()
      return null
    }
  }

  event(row: EventRow) {
    this.archive.events.push(row)
    this.push({ kind: 'event', row })
  }

  answers(rows: AnswerRow[]) {
    this.archive.answers.push(...rows)
    rows.forEach((row) => this.push({ kind: 'answer', row }))
    this.flushSoon()
  }

  flushSoon = () => {
    void this.flush()
  }

  /** Send everything queued, in order. Stops at the first failure and retries later. */
  async flush() {
    if (!supabase || this.flushing || !this.queue.length) return
    this.flushing = true
    try {
      while (this.queue.length) {
        const first = this.queue[0]
        if (first.kind === 'start') {
          const { error } = await supabase.rpc('start_session', first.args)
          if (error) throw error
          this.queue.shift()
        } else {
          // Consecutive items of the same kind go in one insert.
          let n = 0
          while (n < this.queue.length && n < BATCH && this.queue[n].kind === first.kind) n++
          const rows = this.queue.slice(0, n).map((item) => (item as { row: EventRow | AnswerRow }).row)
          const table = first.kind === 'event' ? 'events' : 'answers'
          const { error } = await supabase.from(table).insert(rows)
          if (error) throw error
          this.queue.splice(0, n)
        }
        this.save()
        this.lastError = null
        this.onChange?.()
      }
    } catch (error) {
      this.lastError = String((error as Error)?.message ?? error)
      console.warn('Saving failed; will retry', error)
      this.onChange?.()
    } finally {
      this.flushing = false
    }
  }

  private push(item: QueueItem) {
    if (!this.online) return
    this.queue.push(item)
    this.save()
  }

  private load(): QueueItem[] {
    try {
      const raw = localStorage.getItem(this.storageKey)
      return raw ? (JSON.parse(raw) as QueueItem[]) : []
    } catch {
      return []
    }
  }

  private save() {
    try {
      if (this.queue.length) localStorage.setItem(this.storageKey, JSON.stringify(this.queue))
      else localStorage.removeItem(this.storageKey)
    } catch {
      // Storage full or blocked: the in-memory queue still retries.
    }
  }
}
