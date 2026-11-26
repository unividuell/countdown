import { apiFetch } from '@/api/client'
import type { GameEntry, GameWeight } from '@/api/types'

export const listGames = (slug: string) => apiFetch<GameEntry[]>(`/api/communities/${slug}/games`)

/** The full set; a game left out is normal. */
export const saveGameWeights = (slug: string, weights: Record<string, GameWeight>) =>
  apiFetch<void>(`/api/communities/${slug}/games/weights`, {
    method: 'PUT',
    body: JSON.stringify(weights),
  })
