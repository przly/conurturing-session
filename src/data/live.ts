import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Form } from '@/config'

/**
 * Live link between the participant page and the admin panel, using
 * Supabase Realtime broadcast (messages only; nothing is stored).
 * The participant sends its status once a second; the admin can send
 * override commands back.
 */

export type Phase = 'start' | 'calibrate' | 'round' | 'round-done' | 'survey' | 'between' | 'final' | 'done'

export interface LiveStatus {
  phase: Phase
  round: number | null
  form: Form | null
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
