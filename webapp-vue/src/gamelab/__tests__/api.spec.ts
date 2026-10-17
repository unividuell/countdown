import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '@/api/client'
import {
  forgetMyLabEntry,
  labAssets,
  labAssetUrl,
  openLabRound,
  resetLabRound,
  submitLabGuess,
} from '@/gamelab/api'
import type { LabRoundResponse } from '@/gamelab/types'

describe('gamelab api', () => {
  beforeEach(() => {
    vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never)
  })

  it('opens a round with the seed and phase as query parameters', async () => {
    await openLabRound('team', 'stub', 42, 'ONE')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/team/stub?seed=42&phase=ONE')
  })

  it('posts a guess as JSON', async () => {
    await submitLabGuess('team', 'stub', 42, 'ONE', { value: 123 })
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/team/stub/guess?seed=42&phase=ONE', {
      method: 'POST',
      body: '{"value":123}',
    })
  })

  it('resets the round', async () => {
    await resetLabRound('team', 'stub', 42, 'ONE')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/team/stub/reset?seed=42&phase=ONE', {
      method: 'POST',
    })
  })

  it('forgets my own entry', async () => {
    await forgetMyLabEntry('team', 'stub', 42, 'ONE')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/team/stub/me?seed=42&phase=ONE', {
      method: 'DELETE',
    })
  })

  it('sends phase two when asked', async () => {
    await openLabRound('team', 'stub', 42, 'TWO')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/team/stub?seed=42&phase=TWO')
  })

  it('encodes a slug and game id that need it', async () => {
    // A slug is user-chosen; an unencoded one would silently address a different path.
    await openLabRound('a b', 'x/y', 1, 'ONE')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/a%20b/x%2Fy?seed=1&phase=ONE')
  })

  it('addresses an asset by name, with the seed and phase every lab call carries', () => {
    expect(labAssetUrl('team', 'stub', 42, 'TWO', 'clip-3')).toBe(
      '/api/lab/team/stub/assets/clip-3?seed=42&phase=TWO',
    )
  })

  it('reads lab assets from the round it was opened with', () => {
    const round = {
      seed: 42,
      assetKeys: { photo: { key: 'a2V5', mediaType: 'image/jpeg' } },
    } as unknown as LabRoundResponse

    const assets = labAssets('team', 'stub', 'ONE', round)

    expect(assets.url('photo')).toBe('/api/lab/team/stub/assets/photo?seed=42&phase=ONE')
    expect(assets.key('photo')).toEqual({ key: 'a2V5', mediaType: 'image/jpeg' })
    expect(assets.key('solution')).toBeNull()
  })
})
