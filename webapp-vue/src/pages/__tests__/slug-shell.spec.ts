import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'
import { activeCommunity } from '@/communities/context'

vi.mock('vue-router', async () => {
  const { defineComponent, inject } = await import('vue')
  const { communityKey } = await import('@/communities/context')
  return {
    useRoute: () => ({ params: { slug: 'team' } }),
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
    RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
    RouterView: defineComponent({
      setup() {
        const ctx = inject(communityKey)
        return { doRefresh: () => ctx?.refresh() }
      },
      template: '<button data-test="do-refresh" @click="doRefresh()">child</button>',
    }),
  }
})

describe('community shell guard', () => {
  beforeEach(() => {
    activeCommunity.value = null
  })

  it('renders the child route when an active member', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: false,
      pendingCount: 0,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    expect(w.find('[data-test=do-refresh]').exists()).toBe(true)
    expect(activeCommunity.value?.name).toBe('Team')
  })

  it('shows no-access on 404', async () => {
    vi.spyOn(api, 'getCommunity').mockRejectedValue(new ApiError(404, 'no access'))
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    expect(w.text()).toMatch(/kein Zugriff|nicht gefunden/i)
  })

  it('renders no community chrome in the content area', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 2,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    expect(w.find('header').exists()).toBe(false)
    expect(w.find('[data-test=logout]').exists()).toBe(false)
    expect(w.find('[data-test=admin-menu]').exists()).toBe(false)
    expect(w.text()).not.toContain('Team')
  })

  it('publishes the admin flag and pending count into activeCommunity', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 3,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    mount(Shell)
    await flushPromises()
    expect(activeCommunity.value).toMatchObject({
      slug: 'team',
      name: 'Team',
      viewerIsAdmin: true,
      pendingCount: 3,
    })
  })

  it('republishes activeCommunity when the context is refreshed', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 3,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    get.mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 0,
    })
    await w.find('[data-test=do-refresh]').trigger('click')
    await flushPromises()
    expect(activeCommunity.value?.pendingCount).toBe(0)
  })
})
