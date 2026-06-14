import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'

const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'team' } }),
  useRouter: () => ({ replace }),
}))

// provide an admin context by mocking the inject helper
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
        pendingCount: 1,
      },
    },
    refresh: vi.fn(),
  }),
}))

describe('requests page', () => {
  beforeEach(() => replace.mockReset())
  it('lists pending members and approves one', async () => {
    const list = vi.spyOn(api, 'listMembers').mockResolvedValue([
      { userId: 'u1', username: 'Alice', status: 'PENDING', isAdmin: false },
      { userId: 'u2', username: 'Bob', status: 'ACTIVE', isAdmin: false },
    ])
    const approve = vi.spyOn(api, 'approveMember').mockResolvedValue(undefined as never)
    const Requests = (await import('@/pages/[slug]/requests.vue')).default
    const w = mount(Requests)
    await flushPromises()
    expect(w.text()).toContain('Alice')
    expect(w.text()).not.toContain('Bob') // only PENDING shown
    list.mockResolvedValue([{ userId: 'u2', username: 'Bob', status: 'ACTIVE', isAdmin: false }])
    await w.find('[data-test=approve]').trigger('click')
    await flushPromises()
    expect(approve).toHaveBeenCalledWith('team', 'u1')
  })
})
