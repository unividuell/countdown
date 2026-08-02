import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h, watch } from 'vue'
import * as api from '@/api/communities'
import type { CommunityResponse } from '@/api/types'
import { activeCommunity } from '@/communities/context'
import { _resetCommunitiesState } from '@/communities/useCommunities'
import { _resetRouteDataState, registerCommunityDataGuard } from '@/communities/routeData'
import {
  _resetLandingState,
  landingFailed,
  registerLandingRedirect,
} from '@/communities/landingGuard'

const Stub = defineComponent({ render: () => h('div') })

const team: CommunityResponse = {
  id: 'c1',
  name: 'Team Süd',
  slug: 'team',
  startsAt: null,
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: null,
  viewerIsAdmin: false,
  pendingCount: 0,
}

// Both guards, in the order main.ts registers them: beforeResolve hooks run in
// registration order, so the landing redirect claims '/' before anything else.
function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/communities', component: Stub },
      { path: '/join/:token', component: Stub },
      { path: '/:slug', component: Stub, children: [{ path: '', component: Stub }] },
    ],
  })
  registerLandingRedirect(router)
  registerCommunityDataGuard(router)
  return router
}

describe('landing redirect guard', () => {
  beforeEach(() => {
    sessionStorage.clear()
    _resetLandingState()
    _resetRouteDataState()
    _resetCommunitiesState()
    activeCommunity.value = null
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    vi.spyOn(api, 'getCommunity').mockResolvedValue(team)
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends a member of exactly one community straight to it', async () => {
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: 'c1', name: 'Team Süd', slug: 'team' },
    ])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.params.slug).toBe('team')
  })

  it('sends a member with no communities to the overview', async () => {
    vi.spyOn(api, 'listCommunities').mockResolvedValue([])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/communities')
  })

  it('sends a member with several and no last selection to the overview', async () => {
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: 'c1', name: 'Team Süd', slug: 'team' },
      { id: 'c2', name: 'Team Nord', slug: 'nord' },
    ])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/communities')
  })

  it('returns to the stashed post-login destination instead of the landing', async () => {
    sessionStorage.setItem('postLoginRedirect', '/join/tok123')
    const list = vi.spyOn(api, 'listCommunities')
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/join/tok123')
    expect(list).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('postLoginRedirect')).toBeNull()
  })

  it('records a failure so / can offer a retry instead of hanging', async () => {
    vi.spyOn(api, 'listCommunities').mockRejectedValue(new Error('offline'))
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
    expect(landingFailed.value).toBe(true)
  })

  it('leaves the header untouched when home resolves back to the current community', async () => {
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: 'c1', name: 'Team Süd', slug: 'team' },
    ])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: 'c1' })
    const get = vi.mocked(api.getCommunity)
    const router = makeRouter()
    await router.push('/team/')
    await flushPromises()

    const seen: (string | null)[] = []
    const stop = watch(activeCommunity, (v) => seen.push(v?.slug ?? null), { flush: 'sync' })
    await router.push('/')
    await flushPromises()
    stop()

    // The reported defect: the header used to fall back to 'countdown' and the content
    // to the landing placeholder before arriving back where it started.
    expect(seen).toEqual([])
    expect(activeCommunity.value?.slug).toBe('team')
    expect(router.currentRoute.value.params.slug).toBe('team')
    expect(get).toHaveBeenCalledTimes(1)
  })
})
