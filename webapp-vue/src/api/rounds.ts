import { apiFetch } from '@/api/client'
import type { RoundResponse, Vote } from '@/api/types'

/** The slug is user-chosen, so it is encoded; the round is always „current“ — the server decides which. */
const roundUrl = (slug: string, sub = ''): string =>
  `/api/communities/${encodeURIComponent(slug)}/rounds/current${sub}`

export const getCurrentRound = (slug: string) => apiFetch<RoundResponse>(roundUrl(slug))

/** One past round, by its number. The server refuses anything that is not strictly older with 404. */
export const getRound = (slug: string, roundNumber: number) =>
  apiFetch<RoundResponse>(`/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}`)

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
  `/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}/assets/${key}`

/**
 * One ballot per voter and tip, so `PUT`: a second click replaces it, and `null` withdraws it.
 * The round number rides in the path because the window is „the running round or the one before“,
 * and both must be addressable.
 */
export const castVote = (slug: string, roundNumber: number, userId: string, value: Vote | null) =>
  apiFetch<RoundResponse>(
    `/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}/plays/${encodeURIComponent(userId)}/vote`,
    { method: 'PUT', body: JSON.stringify({ value }) },
  )

/** The game master's verdict on one tip. `null` hands the decision back to the vote. */
export const setAdminOverride = (
  slug: string,
  roundNumber: number,
  userId: string,
  value: boolean | null,
) =>
  apiFetch<RoundResponse>(
    `/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}/plays/${encodeURIComponent(userId)}/override`,
    { method: 'PUT', body: JSON.stringify({ value }) },
  )
