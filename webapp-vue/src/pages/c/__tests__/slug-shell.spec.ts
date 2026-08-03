import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import type { CommunityResponse } from '@/api/types'
import { activeCommunity } from '@/communities/context'
import { _resetRouteDataState, communityRoute } from '@/communities/routeData'

let childMountCount = 0

vi.mock('vue-router', async () => {
  const { defineComponent, inject } = await import('vue')
  const { communityKey } = await import('@/communities/context')
  return {
    RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
    RouterView: defineComponent({
      setup() {
        // A fresh id per instance is how the test tells "remounted" from "patched in place" —
        // a `:key` attribute assertion would pass even if the key never changed.
        const mountId = ++childMountCount
        const ctx = inject(communityKey)
        return { doRefresh: () => ctx?.refresh(), mountId }
      },
      template:
        '<button data-test="do-refresh" :data-mount-id="mountId" @click="doRefresh()">child</button>',
    }),
  }
})

function community(over: Partial<CommunityResponse> = {}): CommunityResponse {
  return {
    id: '1',
    name: 'Team',
    slug: 'team',
    startsAt: null,
    startsAtTimezone: 'Europe/Berlin',
    phaseTwoStartRound: null,
    viewerIsAdmin: true,
    pendingCount: 3,
    ...over,
  }
}

async function mountShell() {
  const Shell = (await import('@/pages/c/[slug].vue')).default
  return mount(Shell)
}

describe('community shell', () => {
  beforeEach(() => {
    _resetRouteDataState()
    activeCommunity.value = null
    childMountCount = 0
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders the child route when the guard resolved a community', async () => {
    communityRoute.value = { kind: 'ready', community: community() }
    const w = await mountShell()
    expect(w.find('[data-test=do-refresh]').exists()).toBe(true)
  })

  it('shows no-access without rendering children', async () => {
    communityRoute.value = { kind: 'no-access' }
    const w = await mountShell()
    expect(w.text()).toMatch(/kein Zugriff/i)
    expect(w.find('[data-test=do-refresh]').exists()).toBe(false)
  })

  it('shows the generic error without rendering children', async () => {
    communityRoute.value = { kind: 'error' }
    const w = await mountShell()
    expect(w.text()).toMatch(/schiefgelaufen/i)
    expect(w.find('[data-test=do-refresh]').exists()).toBe(false)
  })

  it('renders no community chrome in the content area', async () => {
    communityRoute.value = { kind: 'ready', community: community() }
    const w = await mountShell()
    expect(w.find('header').exists()).toBe(false)
    expect(w.find('[data-test=logout]').exists()).toBe(false)
    expect(w.find('[data-test=community-menu]').exists()).toBe(false)
    expect(w.text()).not.toContain('Team')
  })

  it('republishes into the header when a child refreshes the context', async () => {
    communityRoute.value = { kind: 'ready', community: community() }
    const w = await mountShell()
    vi.spyOn(api, 'getCommunity').mockResolvedValue(community({ pendingCount: 0 }))
    await w.find('[data-test=do-refresh]').trigger('click')
    await flushPromises()
    // Publishing only on the initial resolve would leave a stale pending dot behind
    // after an admin clears the requests.
    expect(activeCommunity.value?.pendingCount).toBe(0)
  })

  it('does not fetch on its own — the guard owns that', async () => {
    const get = vi.spyOn(api, 'getCommunity')
    communityRoute.value = { kind: 'ready', community: community() }
    await mountShell()
    await flushPromises()
    expect(get).not.toHaveBeenCalled()
  })

  it('remounts the routed child when switching to a different community', async () => {
    communityRoute.value = { kind: 'ready', community: community({ slug: 'team' }) }
    const w = await mountShell()
    const firstMountId = w.find('[data-test=do-refresh]').attributes('data-mount-id')

    // Vue Router reuses component instances across param-only navigations to the same
    // matched route — this is the same transition a switch-community click produces.
    communityRoute.value = { kind: 'ready', community: community({ slug: 'other' }) }
    await flushPromises()

    const secondMountId = w.find('[data-test=do-refresh]').attributes('data-mount-id')
    // A new instance id proves the child was torn down and rebuilt, not just patched with
    // updated props — the previous community's data-bearing page must not linger on screen.
    expect(secondMountId).not.toBe(firstMountId)
  })
})
