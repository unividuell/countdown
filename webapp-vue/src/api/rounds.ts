import { apiFetch } from '@/api/client'
import type { RoundResponse } from '@/api/types'

/** The slug is user-chosen, so it is encoded; the round is always „current“ — the server decides which. */
const roundUrl = (slug: string, sub = ''): string =>
  `/api/communities/${encodeURIComponent(slug)}/rounds/current${sub}`

export const getCurrentRound = (slug: string) => apiFetch<RoundResponse>(roundUrl(slug))

export const revealRound = (slug: string) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/reveal'), { method: 'POST' })

/**
 * [roundNumber] is the round the caller believes it is playing. The server refuses a mismatch with 409
 * rather than judging the guess against a round the player never saw.
 */
export const submitGuess = (slug: string, roundNumber: number, guess: unknown) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/guess'), {
    method: 'POST',
    body: JSON.stringify({ roundNumber, guess }),
  })
