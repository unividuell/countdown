import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '@/api/client'
import { forgetMyLabEntry, openLabRound, resetLabRound, submitLabGuess } from '@/gamelab/api'

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
})
