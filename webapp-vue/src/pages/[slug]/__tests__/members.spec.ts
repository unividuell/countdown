import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { slug: 'team' } }) }))

describe('members admin page', () => {
  it('lists members and approves a pending one', async () => {
    const list = vi.spyOn(api, 'listMembers')
    list.mockResolvedValue([{ userId: 'u1', username: 'Alice', status: 'PENDING', isAdmin: false }])
    const approve = vi.spyOn(api, 'approveMember').mockResolvedValue(undefined as never)
    const Members = (await import('@/pages/[slug]/members.vue')).default
    const w = mount(Members)
    await flushPromises()
    expect(w.text()).toContain('Alice')
    list.mockResolvedValue([{ userId: 'u1', username: 'Alice', status: 'ACTIVE', isAdmin: false }])
    await w.find('[data-test=approve]').trigger('click')
    await flushPromises()
    expect(approve).toHaveBeenCalledWith('team', 'u1')
  })
})

describe('settings page', () => {
  it('generates an invite link and shows it', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      phaseTwoStartRound: null,
    })
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
