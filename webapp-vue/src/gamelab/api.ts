import { apiFetch } from '@/api/client'
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
