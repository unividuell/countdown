import type { RoundAssets } from '@/api/assets'
import { apiFetch } from '@/api/client'
import type { RoundResponse, Vote } from '@/api/types'

/** The slug is user-chosen, so it is encoded; the round is always „current“ — the server decides which. */
const roundUrl = (slug: string, sub = ''): string =>
  `/api/communities/${encodeURIComponent(slug)}/rounds/current${sub}`

export const getCurrentRound = (slug: string) => apiFetch<RoundResponse>(roundUrl(slug))

/** One past round, by its number. The server refuses anything that is not strictly older with 404. */
export const getRound = (slug: string, roundNumber: number) =>
  apiFetch<RoundResponse>(`/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}`)

/** [roundNumber] as on a guess: a reveal after the round switch must not open the next round unseen. */
export const revealRound = (slug: string, roundNumber: number) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/reveal'), {
    method: 'POST',
    body: JSON.stringify({ roundNumber }),
  })

/**
 * [roundNumber] is the round the caller believes it is playing. The server refuses a mismatch with 409
 * rather than judging the guess against a round the player never saw.
 */
export const submitGuess = (slug: string, roundNumber: number, guess: unknown) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/guess'), {
    method: 'POST',
    body: JSON.stringify({ roundNumber, guess }),
  })

/**
 * [fromStage] is the stage the caller believes it is on — the server 409s a mismatch. [input] is what
 * the step carries; `undefined` drops out of the JSON, which is a step without one.
 */
export const skipStage = (slug: string, roundNumber: number, fromStage: number, input?: unknown) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/skip'), {
    method: 'POST',
    body: JSON.stringify({ roundNumber, fromStage, input }),
  })

export const giveUpRound = (slug: string, roundNumber: number) =>
  apiFetch<RoundResponse>(roundUrl(slug, '/give-up'), {
    method: 'POST',
    body: JSON.stringify({ roundNumber }),
  })

/**
 * The cache key is the whole URL, and a round number is reused by every new run — so the round's
 * own id rides along, and a new run never meets an old entry. The name is unique within the round.
 */
export const roundAssetUrl = (
  slug: string,
  roundNumber: number,
  roundGameId: string,
  name: string,
): string =>
  `/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}/assets/${encodeURIComponent(name)}?round=${roundGameId}`

/** `undefined` while there is nothing to address: no round on the grid, or no game row behind it. */
export const roundAssets = (slug: string, round: RoundResponse): RoundAssets | undefined => {
  const roundNumber = round.round?.number
  const roundGameId = round.roundGameId
  if (roundNumber == null || roundGameId == null) return undefined

  return {
    url: (name) => roundAssetUrl(slug, roundNumber, roundGameId, name),
    key: (name) => round.assetKeys[name] ?? null,
  }
}

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
