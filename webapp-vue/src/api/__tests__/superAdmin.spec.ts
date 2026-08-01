import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as client from '@/api/client'
import { listAllCommunities, listSuperAdmins } from '@/api/superAdmin'

vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof client>()), apiFetch: vi.fn() }))
const apiFetch = vi.mocked(client.apiFetch)

describe('super-admin api', () => {
  beforeEach(() => apiFetch.mockReset())

  it('lists super-admins', async () => {
    apiFetch.mockResolvedValue([
      {
        githubLogin: 'boss',
        username: 'Boss',
        userId: 'u1',
        flagged: true,
        allowlisted: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    const rows = await listSuperAdmins()
    expect(apiFetch).toHaveBeenCalledWith('/api/super-admin/super-admins')
    expect(rows[0]!.githubLogin).toBe('boss')
  })

  it('lists all communities with their members', async () => {
    apiFetch.mockResolvedValue([
      {
        id: 'c1',
        name: 'Team',
        slug: 'team',
        startsAt: null,
        startsAtTimezone: 'Europe/Berlin',
        createdAt: '2026-01-01T00:00:00Z',
        members: [
          {
            userId: 'u1',
            username: 'Alice',
            githubLogin: 'alice',
            status: 'ACTIVE',
            isAdmin: true,
            joinedAt: '2026-02-01T00:00:00Z',
          },
        ],
      },
    ])
    const rows = await listAllCommunities()
    expect(apiFetch).toHaveBeenCalledWith('/api/super-admin/communities')
    expect(rows[0]!.members[0]!.isAdmin).toBe(true)
  })
})
