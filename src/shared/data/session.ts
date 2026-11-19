import { supabase } from './supabase'
import { isOrder, isTestType, parseClips, parseConditions, type SessionConfig } from '@/config'

const TIMEOUT_MS = 8000

/**
 * Asks the database which test a `?session=` link runs.
 * Returns null when the session doesn't exist (yet): a form-test link
 * then creates it on Start, as before. Throws on network/server errors.
 */
export async function loadSessionConfig(id: string): Promise<SessionConfig | null> {
  if (!supabase) return null
  const call = supabase.rpc('get_session_config', { p_id: id })
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))
  const { data, error } = await Promise.race([call, timeout])
  if (error) throw error
  if (!data) return null
  const raw = data as Record<string, unknown>
  return {
    test_type: isTestType(raw.test_type) ? raw.test_type : 'form',
    order_ab: isOrder(raw.order_ab) ? raw.order_ab : null,
    condition_order: parseConditions(raw.condition_order as string | null),
    clip_assignment: parseClips(raw.clip_assignment as string | null),
    clip3_offset_sec: typeof raw.clip3_offset_sec === 'number' ? raw.clip3_offset_sec : null,
    include_c: raw.include_c === true,
  }
}
