import { ApiError } from '@/api/client'

const GENERIC = 'Speichern fehlgeschlagen.'

/**
 * A ProblemDetail's `detail` — the sentence the server wrote about this request. Anything else
 * (a network failure, a timeout, a 500) has no explanation worth repeating.
 */
function detailOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const detail = (body as { detail?: unknown }).detail
  return typeof detail === 'string' && detail.trim().length > 0 ? detail.trim() : null
}

/**
 * What to put under the save button. The generic sentence alone leaves the user guessing at a
 * validation error they can actually fix — a rejected colour or a name over the limit — so where
 * the server said what is wrong, it is quoted rather than swallowed.
 */
export function saveErrorMessage(e: unknown): string {
  const detail = e instanceof ApiError ? detailOf(e.body) : null
  return detail ? `Speichern fehlgeschlagen: „${detail}“` : GENERIC
}
