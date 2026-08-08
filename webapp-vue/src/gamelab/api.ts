import { apiFetch } from '@/api/client'
import type { LabRoundResponse } from './types'

/**
 * The seed rides on every call because it IS the round key — the server's auto-eviction hangs off
 * exactly this parameter, so a call without it could not say which round it means. The slug is
 * user-chosen and the game id comes from the URL, so both are encoded.
 */
function labUrl(slug: string, game: string, seed: number, sub = ''): string {
  return `/api/lab/${encodeURIComponent(slug)}/${encodeURIComponent(game)}${sub}?seed=${seed}`
}

export const openLabRound = <P>(slug: string, game: string, seed: number) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed))

export const submitLabGuess = <P>(slug: string, game: string, seed: number, guess: unknown) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed, '/guess'), {
    method: 'POST',
    body: JSON.stringify(guess),
  })

export const resetLabRound = <P>(slug: string, game: string, seed: number) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed, '/reset'), { method: 'POST' })

export const forgetMyLabEntry = <P>(slug: string, game: string, seed: number) =>
  apiFetch<LabRoundResponse<P>>(labUrl(slug, game, seed, '/me'), { method: 'DELETE' })
