import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Form } from '@/config'

/**
 * Live link between the participant page and the admin panel, using
 * Supabase Realtime broadcast (messages only; nothing is stored).
 * The participant sends its status once a second; the admin can send
 * override commands back.
 */

export type Phase =
  | 'start'
  | 'calibrate' // form
  | 'intro' // weather: intro clip
  | 'check' // weather: comprehension question
  | 'between' // form: before a round; weather: framing line before a condition
  | 'round' // a round (form) or condition (weather) is running
  | 'round-done'
  | 'survey'
  | 'final'
  | 'done'

export interface LiveStatus {
  phase: Phase
  round: number | null
  form: Form | null
  /** Weather test: 'A' / 'B' / 'C' of the current condition (absent in the form test). */
  condition?: string | null
  t: number | null
  health: number | null
  pulse: number | null
  listening: boolean
  pending: number
}

export interface LiveEvent {
  round: number
  type: string
  t_sec: number
  duration_sec?: number
  health: number
}

export type Command = 'pulse' | 'wither' | 'skip' | 'restart'

const channelName = (sessionId: string) => `twin-${sessionId}`

export function openParticipantChannel(sessionId: string, onCommand: (command: Command) => void) {
  if (!supabase) return null
  const channel: RealtimeChannel = supabase
    .channel(channelName(sessionId))
    .on('broadcast', { event: 'command' }, ({ payload }) => onCommand(payload.command as Command))
    .subscribe()
  return {
    status: (status: LiveStatus) => void channel.send({ type: 'broadcast', event: 'status', payload: status }),
    event: (event: LiveEvent) => void channel.send({ type: 'broadcast', event: 'event', payload: event }),
    close: () => void supabase!.removeChannel(channel),
  }
}

export function openAdminChannel(
  sessionId: string,
  onStatus: (status: LiveStatus) => void,
  onEvent: (event: LiveEvent) => void,
) {
  if (!supabase) return null
  const channel: RealtimeChannel = supabase
    .channel(channelName(sessionId))
    .on('broadcast', { event: 'status' }, ({ payload }) => onStatus(payload as LiveStatus))
    .on('broadcast', { event: 'event' }, ({ payload }) => onEvent(payload as LiveEvent))
    .subscribe()
  return {
    command: (command: Command) =>
      void channel.send({ type: 'broadcast', event: 'command', payload: { command } }),
    close: () => void supabase!.removeChannel(channel),
  }
}
