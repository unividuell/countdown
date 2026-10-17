import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '@/api/client'
import {
  getCurrentRound,
  getRound,
  revealRound,
  roundAssets,
  roundAssetUrl,
  submitGuess,
} from '@/api/rounds'
import type { RoundResponse } from '@/api/types'

vi.mock('@/api/client', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }))

describe('rounds api', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the current round', async () => {
    await getCurrentRound('team')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/team/rounds/current')
  })

  it('reveals the round it is meant for', async () => {
    await revealRound('team', 12)
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/team/rounds/current/reveal', {
      method: 'POST',
      body: JSON.stringify({ roundNumber: 12 }),
    })
  })

  it('sends the guess together with the round it is meant for', async () => {
    await submitGuess('team', 12, { hue: 123.5 })
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/team/rounds/current/guess', {
      method: 'POST',
      body: JSON.stringify({ roundNumber: 12, guess: { hue: 123.5 } }),
    })
  })

  it('encodes a slug that needs it', async () => {
    await getCurrentRound('a b/c')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/a%20b%2Fc/rounds/current')
  })

  it('reads one past round by its number', async () => {
    await getRound('team', 13)
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/team/rounds/13')
  })

  it('puts the round id into the asset URL so a new run never meets an old cache entry', () => {
    expect(roundAssetUrl('hütte', 7, '0191a2b3-0000-7000-8000-000000000000', 'board')).toBe(
      '/api/communities/h%C3%BCtte/rounds/7/assets/board?round=0191a2b3-0000-7000-8000-000000000000',
    )
  })

  describe('roundAssets', () => {
    const response = (over: Partial<RoundResponse> = {}): RoundResponse => ({
      round: {
        number: 7,
        label: 'T-7',
        start: '2026-08-14T10:00:00Z',
        end: '2026-08-15T10:00:00Z',
      },
      game: null,
      noGameReason: null,
      previousRoundNumber: null,
      scene: null,
      payload: null,
      solution: null,
      me: null,
      others: [],
      awardRule: null,
      awardPoints: null,
      canOverride: false,
      roundGameId: '0191a2b3-0000-7000-8000-000000000000',
      assetKeys: { board: { key: 'a2V5', mediaType: 'image/png' } },
      ...over,
    })

    it('is undefined for a round without a game row', () => {
      expect(roundAssets('team', response({ roundGameId: null }))).toBeUndefined()
    })

    it('is undefined without a round', () => {
      expect(roundAssets('team', response({ round: null }))).toBeUndefined()
    })

    it('builds the url from the response and reads keys from it, null for a missing one', () => {
      const assets = roundAssets('team', response())!

      expect(assets.url('board')).toBe(
        '/api/communities/team/rounds/7/assets/board?round=0191a2b3-0000-7000-8000-000000000000',
      )
      expect(assets.key('board')).toEqual({ key: 'a2V5', mediaType: 'image/png' })
      expect(assets.key('patch')).toBeNull()
    })
  })
})
