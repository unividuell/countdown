import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as client from '@/api/client'
import { createCommunity, listCommunities, joinByToken } from '@/api/communities'

vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof client>()), apiFetch: vi.fn() }))
const apiFetch = vi.mocked(client.apiFetch)

describe('communities api', () => {
  beforeEach(() => apiFetch.mockReset())

  it('creates a community', async () => {
    apiFetch.mockResolvedValue({ id: '1', name: 'Team A', slug: 'team-a', startsAt: null, phaseTwoStartRound: null })
    const c = await createCommunity('Team A')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities', { method: 'POST', body: JSON.stringify({ name: 'Team A' }) })
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
})
