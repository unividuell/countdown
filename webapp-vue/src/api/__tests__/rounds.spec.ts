import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '@/api/client'
import { getCurrentRound, revealRound, submitGuess } from '@/api/rounds'

vi.mock('@/api/client', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }))

describe('rounds api', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the current round', async () => {
    await getCurrentRound('team')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/team/rounds/current')
  })

  it('reveals with a post and no body', async () => {
    await revealRound('team')
    expect(client.apiFetch).toHaveBeenCalledWith('/api/communities/team/rounds/current/reveal', {
      method: 'POST',
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
})
