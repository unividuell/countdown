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
  gamesFromRound: 24,
  viewerIsAdmin: true,
  pendingCount: 0,
  editionFrozen: false,
  viewerIdentity: null,
}

describe('settings — timezone + zone-relative startsAt', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({ ...community })
    vi.spyOn(api, 'getInvite').mockResolvedValue(null)
    vi.spyOn(api, 'updateCommunity').mockResolvedValue({ ...community })
  })

  it('renders the startsAt as wall-time in the selected zone (11:00, not browser-local)', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    const startInput = w.find('input[type="datetime-local"]').element as HTMLInputElement
    expect(startInput.value).toBe('2026-06-25T11:00')
    const zoneSelect = w.find('select')
    expect((zoneSelect.element as HTMLSelectElement).value).toBe('Europe/Berlin')
  })

  it('saves startsAt converted from the selected zone and sends startsAtTimezone', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.objectContaining({
        startsAt: '2026-06-25T09:00:00.000Z',
        startsAtTimezone: 'Europe/Berlin',
      }),
    )
  })

  it('renders startsAt in a non-default community zone (America/New_York)', async () => {
    // 09:00Z is 05:00 EDT on 2026-06-25 (summer, UTC-4)
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      ...community,
      startsAtTimezone: 'America/New_York',
    })
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    expect((w.find('input[type="datetime-local"]').element as HTMLInputElement).value).toBe(
      '2026-06-25T05:00',
    )
    expect((w.find('select').element as HTMLSelectElement).value).toBe('America/New_York')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.objectContaining({
        startsAt: '2026-06-25T09:00:00.000Z',
        startsAtTimezone: 'America/New_York',
      }),
    )
  })

  it('shows the community URL prefixed with /c/, not the bare slug', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    expect(w.text()).toContain('/c/team/')
  })

  it('renders gamesFromRound and sends it back', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    const field = w.find('[data-test="games-from-round"]')
    expect((field.element as HTMLInputElement).value).toBe('24')

    await field.setValue(40)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.objectContaining({ gamesFromRound: 40 }),
    )
  })

  it('omits gamesFromRound when the field is cleared', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('[data-test="games-from-round"]').setValue('')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.not.objectContaining({ gamesFromRound: expect.anything() }),
    )
  })

  it('says the grid is still open while the first game round is ahead', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    expect(w.find('input[type="datetime-local"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-test="freeze-hint"]').text()).toContain('Änderbar')
  })

  it('reflects a freeze the save itself just caused, without a remount', async () => {
    vi.spyOn(api, 'updateCommunity').mockResolvedValue({ ...community, editionFrozen: true })
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('input[type="datetime-local"]').attributes('disabled')).toBeDefined()
    expect(w.find('select').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="freeze-hint"]').text()).toContain('Der Lauf hat begonnen')
  })
})

describe('settings — a run that has begun', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({ ...community, editionFrozen: true })
    vi.spyOn(api, 'getInvite').mockResolvedValue(null)
    vi.spyOn(api, 'updateCommunity').mockResolvedValue({ ...community, editionFrozen: true })
  })

  it('locks start and timezone and says why', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    expect(w.find('input[type="datetime-local"]').attributes('disabled')).toBeDefined()
    expect(w.find('select').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="freeze-hint"]').text()).toContain('Der Lauf hat begonnen')
  })

  it('leaves start and timezone out of the request', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.not.objectContaining({ startsAt: expect.anything() }),
    )
    expect(api.updateCommunity).toHaveBeenCalledWith(
      'team',
      expect.not.objectContaining({ startsAtTimezone: expect.anything() }),
    )
  })
})
