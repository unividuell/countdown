import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/communities/useAdminGuard', () => ({ useAdminGuard: vi.fn() }))
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: { value: { slug: 'team', viewerIsAdmin: true } },
    refresh: vi.fn(),
  }),
}))

const community = {
  id: '1',
  name: 'Team',
  slug: 'team',
  startsAt: '2026-06-25T09:00:00Z', // 11:00 in Europe/Berlin (summer)
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: null,
  viewerIsAdmin: true,
  pendingCount: 0,
}

describe('settings — timezone + zone-relative startsAt', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({ ...community })
    vi.spyOn(api, 'getInvite').mockResolvedValue(null)
    vi.spyOn(api, 'updateCommunity').mockResolvedValue({ ...community })
  })

  it('renders the startsAt as wall-time in the selected zone (11:00, not browser-local)', async () => {
    const Settings = (await import('@/pages/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    const startInput = w.find('input[type="datetime-local"]').element as HTMLInputElement
    expect(startInput.value).toBe('2026-06-25T11:00')
    const zoneSelect = w.find('select')
    expect((zoneSelect.element as HTMLSelectElement).value).toBe('Europe/Berlin')
  })

  it('saves startsAt converted from the selected zone and sends startsAtTimezone', async () => {
    const Settings = (await import('@/pages/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.objectContaining({ startsAt: '2026-06-25T09:00:00.000Z', startsAtTimezone: 'Europe/Berlin' }),
    )
  })
})
