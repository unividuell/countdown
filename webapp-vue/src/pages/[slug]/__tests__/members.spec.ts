import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'team' } }),
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: {
      value: {
        id: '1',
        name: 'Team',
        slug: 'team',
        startsAt: null,
        startsAtTimezone: 'Europe/Berlin',
        phaseTwoStartRound: null,
        viewerIsAdmin: true,
        pendingCount: 0,
      },
    },
    refresh: vi.fn(),
  }),
}))

describe('members admin page', () => {
  it('lists only ACTIVE members and removes one', async () => {
    const list = vi.spyOn(api, 'listMembers').mockResolvedValue([
      { userId: 'u1', username: 'Alice', status: 'ACTIVE', isAdmin: false },
      { userId: 'u2', username: 'Bob', status: 'PENDING', isAdmin: false },
    ])
    const remove = vi.spyOn(api, 'removeMember').mockResolvedValue(undefined as never)
    const Members = (await import('@/pages/[slug]/members.vue')).default
    const w = mount(Members)
    await flushPromises()
    expect(w.text()).toContain('Alice')
    expect(w.text()).not.toContain('Bob') // PENDING not shown
    list.mockResolvedValue([])
    await w.find('[data-test=remove]').trigger('click')
    await flushPromises()
    expect(remove).toHaveBeenCalledWith('team', 'u1')
  })
})

describe('settings page', () => {
  beforeEach(() => vi.clearAllMocks())
  it('shows the current invite link and can revoke it', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 0,
    })
    vi.spyOn(api, 'getInvite').mockResolvedValue({
      url: '/join/tok',
      expiresAt: '2030-01-01T00:00:00Z',
    })
    const revoke = vi.spyOn(api, 'revokeInvite').mockResolvedValue(undefined as never)
    const Settings = (await import('@/pages/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    expect(w.text()).toContain('/join/tok')
    await w.find('[data-test=revoke-invite]').trigger('click')
    await flushPromises()
    expect(revoke).toHaveBeenCalledWith('team')
  })
  it('generates an invite link and shows it', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 0,
    })
    vi.spyOn(api, 'getInvite').mockResolvedValue(null)
    vi.spyOn(api, 'generateInvite').mockResolvedValue({
      url: '/join/tok123',
      expiresAt: '2030-01-01T00:00:00Z',
    })
    const Settings = (await import('@/pages/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('[data-test=generate-invite]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('/join/tok123')
  })
})
