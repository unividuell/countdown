import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as client from '@/api/client'
import {
  createCommunity,
  listCommunities,
  joinByToken,
  getInvite,
  revokeInvite,
} from '@/api/communities'

vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof client>()), apiFetch: vi.fn() }))
const apiFetch = vi.mocked(client.apiFetch)

describe('communities api', () => {
  beforeEach(() => apiFetch.mockReset())

  it('creates a community', async () => {
    apiFetch.mockResolvedValue({
      id: '1',
      name: 'Team A',
      slug: 'team-a',
      startsAt: null,
      phaseTwoStartRound: null,
    })
    const c = await createCommunity('Team A')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities', {
      method: 'POST',
      body: JSON.stringify({ name: 'Team A' }),
    })
    expect(c.slug).toBe('team-a')
  })

  it('lists communities', async () => {
    apiFetch.mockResolvedValue([{ id: '1', name: 'A', slug: 'a' }])
    expect(await listCommunities()).toHaveLength(1)
  })

  it('joins by token', async () => {
    apiFetch.mockResolvedValue({ status: 'JOINED_PENDING', name: 'A', slug: 'a' })
    const r = await joinByToken('tok')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/join/tok', { method: 'POST' })
    expect(r.status).toBe('JOINED_PENDING')
  })

  it('gets the current invite (or null on 204)', async () => {
    apiFetch.mockResolvedValue({ url: '/join/tok', expiresAt: '2030-01-01T00:00:00Z' })
    const r = await getInvite('team')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/team/invite')
    expect(r?.url).toBe('/join/tok')
  })

  it('revokes the invite', async () => {
    apiFetch.mockResolvedValue(undefined)
    await revokeInvite('team')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/team/invite', { method: 'DELETE' })
  })
})
