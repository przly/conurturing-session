import type { OptionKey } from './surveyContent'

/**
 * Sends a finished survey to the Google Apps Script web app
 * (setup: `google-apps-script/README.md`). The URL comes from
 * `VITE_SHEETS_URL` in `.env.local`.
 */
const SHEETS_URL = import.meta.env.VITE_SHEETS_URL as string | undefined
const TIMEOUT_MS = 15000

export interface SubmissionPayload {
  response_id: string
  survey_version: string
  answers: Record<string, OptionKey>
}

export function createResponseId() {
  return crypto.randomUUID()
}

export async function submitResponse(payload: SubmissionPayload): Promise<void> {
  if (!SHEETS_URL) {
    if (import.meta.env.DEV) {
      // Lets you click through the survey locally before Sheets is set up.
      console.info('VITE_SHEETS_URL is not set; response not saved.', payload)
      return
    }
    throw new Error('Saving is not set up (VITE_SHEETS_URL is missing).')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    // text/plain keeps this a "simple" request, so the browser skips the
    // CORS preflight that Apps Script cannot answer.
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !body?.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  } finally {
    clearTimeout(timer)
  }
}
