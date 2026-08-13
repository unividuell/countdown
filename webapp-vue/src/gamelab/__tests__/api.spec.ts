import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '@/api/client'
import { forgetMyLabEntry, openLabRound, resetLabRound, submitLabGuess } from '@/gamelab/api'

describe('gamelab api', () => {
  beforeEach(() => {
    vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never)
  })

  it('opens a round with the seed as a query parameter', async () => {
    await openLabRound('team', 'stub', 42)
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/team/stub?seed=42')
  })

  it('posts a guess as JSON', async () => {
    await submitLabGuess('team', 'stub', 42, { value: 123 })
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/team/stub/guess?seed=42', {
      method: 'POST',
      body: '{"value":123}',
    })
  })

  it('resets the round', async () => {
    await resetLabRound('team', 'stub', 42)
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/team/stub/reset?seed=42', {
      method: 'POST',
    })
  })

  it('forgets my own entry', async () => {
    await forgetMyLabEntry('team', 'stub', 42)
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/team/stub/me?seed=42', {
      method: 'DELETE',
    })
  })

  it('encodes a slug and game id that need it', async () => {
    // A slug is user-chosen; an unencoded one would silently address a different path.
    await openLabRound('a b', 'x/y', 1)
    expect(client.apiFetch).toHaveBeenCalledWith('/api/lab/a%20b/x%2Fy?seed=1')
  })
})
