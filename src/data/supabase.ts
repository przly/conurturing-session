import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Null when the env vars are missing: the app then keeps data locally only. */
export const supabase = url && anonKey ? createClient(url, anonKey) : null
