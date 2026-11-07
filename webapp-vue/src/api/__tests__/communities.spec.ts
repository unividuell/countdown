import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as client from '@/api/client'
import {
  createCommunity,
  createEdition,
  replaceEdition,
  updateCommunity,
  listCommunities,
  joinByToken,
  getInvite,
  revokeInvite,
} from '@/api/communities'
import type {
  AcceptResponse,
  EditionRequest,
  CommunityResponse,
  CommunitySummary,
  InviteResponse,
} from '@/api/types'

vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof client>()), apiFetch: vi.fn() }))
const apiFetch = vi.mocked(client.apiFetch)

describe('communities api', () => {
  beforeEach(() => apiFetch.mockReset())

  it('creates a community', async () => {
    apiFetch.mockResolvedValue({
      id: '1',
      name: 'Team A',
      slug: 'team-a',
      edition: null,
      viewerIsAdmin: true,
      pendingCount: 0,
      viewerIdentity: null,
    } satisfies CommunityResponse)
    const c = await createCommunity('Team A')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities', {
      method: 'POST',
      body: JSON.stringify({ name: 'Team A' }),
    })
    expect(c.slug).toBe('team-a')
  })

  it('lists communities', async () => {
    apiFetch.mockResolvedValue([{ id: '1', name: 'A', slug: 'a' }] satisfies CommunitySummary[])
    expect(await listCommunities()).toHaveLength(1)
  })

  it('joins by token', async () => {
    apiFetch.mockResolvedValue({
      status: 'JOINED_PENDING',
      name: 'A',
      slug: 'a',
    } satisfies AcceptResponse)
    const r = await joinByToken('tok')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/join/tok', { method: 'POST' })
    expect(r.status).toBe('JOINED_PENDING')
  })

  it('gets the current invite (or null on 204)', async () => {
    apiFetch.mockResolvedValue({
      url: '/join/tok',
      expiresAt: '2030-01-01T00:00:00Z',
    } satisfies InviteResponse)
    const r = await getInvite('team')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/team/invite')
    expect(r?.url).toBe('/join/tok')
  })

  it('revokes the invite', async () => {
    apiFetch.mockResolvedValue(undefined)
    await revokeInvite('team')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/team/invite', { method: 'DELETE' })
  })

  it('renames a community with the name only', async () => {
    apiFetch.mockResolvedValue({})
    await updateCommunity('team', 'Team B')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/team', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Team B' }),
    })
  })

  it('creates and replaces the active edition', async () => {
    const body: EditionRequest = {
      label: null,
      targetAt: '2026-06-25T09:00:00.000Z',
      targetTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      gamesFromRound: -24,
    }
    apiFetch.mockResolvedValue({})

    await createEdition('team', body)
    expect(apiFetch).toHaveBeenLastCalledWith('/api/communities/team/editions', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    await replaceEdition('team', body)
    expect(apiFetch).toHaveBeenLastCalledWith('/api/communities/team/editions/active', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  })
})
