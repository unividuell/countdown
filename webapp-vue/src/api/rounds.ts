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

/** [fromStage] is the stage the caller believes it is on — the server 409s a mismatch. */
export const skipStage = (slug: string, roundNumber: number, fromStage: number) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/skip'), {
    method: 'POST',
    body: JSON.stringify({ roundNumber, fromStage }),
  })

export const giveUpRound = (slug: string, roundNumber: number) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/give-up'), {
    method: 'POST',
    body: JSON.stringify({ roundNumber }),
  })

/** Round number and key ride in the URL so each pair is its own privately cacheable resource. */
export const roundAssetUrl = (slug: string, roundNumber: number, key: number): string =>
  roundUrl(slug, `/assets/${roundNumber}/${key}`)
