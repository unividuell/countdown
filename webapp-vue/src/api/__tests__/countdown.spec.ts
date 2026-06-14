import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as client from '@/api/client'
import { getCountdown } from '@/api/countdown'

vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof client>()), apiFetch: vi.fn() }))
const apiFetch = vi.mocked(client.apiFetch)

describe('countdown api', () => {
  beforeEach(() => apiFetch.mockReset())

  it('fetches the countdown for a slug', async () => {
    apiFetch.mockResolvedValue({
      serverNow: '2026-06-14T09:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: {
        number: 9,
        label: 'T-9',
        start: '2026-06-15T09:00:00Z',
        end: '2026-06-16T09:00:00Z',
      },
    })
    const r = await getCountdown('team')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/team/countdown')
    expect(r.round?.label).toBe('T-10')
  })

  it('handles a community with no startsAt (null rounds)', async () => {
    apiFetch.mockResolvedValue({
      serverNow: '2026-06-14T09:00:00Z',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      round: null,
      nextRound: null,
    })
    const r = await getCountdown('team')
    expect(r.round).toBeNull()
    expect(r.nextRound).toBeNull()
  })
})
