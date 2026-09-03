import { apiFetch } from '@/api/client'
import type { Vote } from '@/api/types'
import type { LabPhase, LabRoundResponse } from './types'

/**
 * The seed rides on every call because it IS the round key — the server's auto-eviction hangs off
 * exactly this parameter, so a call without it could not say which round it means. Phase rides
 * alongside it for the same reason: either one displacing the other is what the store's
 * self-limiting rule now means. The slug is user-chosen and the game id comes from the URL, so
 * both are encoded.
 */
function labUrl(slug: string, game: string, seed: number, phase: LabPhase, sub = ''): string {
  return `/api/lab/${encodeURIComponent(slug)}/${encodeURIComponent(game)}${sub}?seed=${seed}&phase=${phase}`
}

export const openLabRound = <P>(slug: string, game: string, seed: number, phase: LabPhase) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed, phase))

/** The explicit reveal — starts the tester's clock, once. Mirrors `revealRound` in the real round. */
export const revealLabRound = <P>(slug: string, game: string, seed: number, phase: LabPhase) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed, phase, '/reveal'), { method: 'POST' })

export const submitLabGuess = <P>(
  slug: string,
  game: string,
  seed: number,
  phase: LabPhase,
  guess: unknown,
) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed, phase, '/guess'), {
    method: 'POST',
    body: JSON.stringify(guess),
  })

export const resetLabRound = <P>(slug: string, game: string, seed: number, phase: LabPhase) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed, phase, '/reset'), { method: 'POST' })

export const forgetMyLabEntry = <P>(slug: string, game: string, seed: number, phase: LabPhase) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed, phase, '/me'), { method: 'DELETE' })

/** Voluntary stage advance — „mehr hören“, guarded server-side by the stage the client believes it is on. */
export const skipLabStage = <P>(
  slug: string,
  game: string,
  seed: number,
  phase: LabPhase,
  fromStage: number,
) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed, phase, '/skip'), {
    method: 'POST',
    body: JSON.stringify({ fromStage }),
  })

/** The explicit exit without an answer. */
export const giveUpLabRound = <P>(slug: string, game: string, seed: number, phase: LabPhase) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed, phase, '/give-up'), { method: 'POST' })

/** The round's binary assets, stage-gated exactly like the real round's — a plain URL, not a fetch:
 * callers pass it to `fetchAssetBlob` themselves, the same way the real round's `assetUrl` works. */
export const labAssetUrl = (
  slug: string,
  game: string,
  seed: number,
  phase: LabPhase,
  key: number,
): string => labUrl(slug, game, seed, phase, `/assets/${key}`)

/** Casting, changing, or withdrawing a ballot on somebody else's tip. Mirrors `castVote`. */
export const castLabVote = <P>(
  slug: string,
  game: string,
  seed: number,
  phase: LabPhase,
  userId: string,
  value: Vote | null,
) =>
  apiFetch<LabRoundResponse<P>>(
    labUrl(slug, game, seed, phase, `/plays/${encodeURIComponent(userId)}/vote`),
    { method: 'PUT', body: JSON.stringify({ value }) },
  )

/** The game master's verdict on one tip. `null` hands the decision back to the vote. Mirrors `setAdminOverride`. */
export const setLabOverride = <P>(
  slug: string,
  game: string,
  seed: number,
  phase: LabPhase,
  userId: string,
  value: boolean | null,
) =>
  apiFetch<LabRoundResponse<P>>(
    labUrl(slug, game, seed, phase, `/plays/${encodeURIComponent(userId)}/override`),
    { method: 'PUT', body: JSON.stringify({ value }) },
  )
