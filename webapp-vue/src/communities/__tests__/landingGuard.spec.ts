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
  resolveLandingTarget,
} from '@/communities/landingGuard'
import { slugParam } from './routerTestUtils'

const Stub = defineComponent({ render: () => h('div') })

const team: CommunityResponse = {
  id: 'c1',
  name: 'Team Süd',
  slug: 'team',
  startsAt: null,
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: null,
  gamesFromRound: null,
  viewerIsAdmin: false,
  pendingCount: 0,
  editionFrozen: false,
}
const nord: CommunityResponse = { ...team, id: 'c2', name: 'Team Nord', slug: 'nord' }

// Both guards, in the order main.ts registers them: beforeResolve hooks run in
// registration order, so the landing redirect claims '/' before anything else.
function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/communities', component: Stub },
      { path: '/join/:token', component: Stub },
      { path: '/c/:slug', component: Stub, children: [{ path: '', component: Stub }] },
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
    expect(slugParam(router)).toBe('team')
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
    await router.push('/c/team/')
    await flushPromises()

    // Watching activeCommunity and the current path in the same synchronous callback
    // proves '/' never commits mid-transition — not just that the header never
    // changed — rather than inferring it from the end state.
    const seen: { slug: string | null; path: string }[] = []
    const stop = watch(
      [activeCommunity, () => router.currentRoute.value.path],
      ([v, path]) => seen.push({ slug: v?.slug ?? null, path }),
      { flush: 'sync' },
    )
    await router.push('/')
    await flushPromises()
    stop()

    // The reported defect: the header used to fall back to 'countdown' and the content
    // to the landing placeholder before arriving back where it started.
    expect(seen).toEqual([])
    expect(activeCommunity.value?.slug).toBe('team')
    expect(slugParam(router)).toBe('team')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('waits for an in-flight selection write before resolving the landing target, rather than racing it', async () => {
    // A community switch persists its selection fire-and-forget after the navigation
    // commits (routeData.ts). Clicking the header brand within that write's round-trip
    // must not let the landing guard read the *previous* selection.
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: 'c1', name: 'Team Süd', slug: 'team' },
      { id: 'c2', name: 'Team Nord', slug: 'nord' },
    ])
    let releaseSelectionWrite!: () => void
    const blockedSelectionWrite = new Promise<void>((r) => {
      releaseSelectionWrite = r
    })
    vi.spyOn(api, 'setSelection').mockReturnValue(blockedSelectionWrite)
    const getSelection = vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: 'c2' })
    vi.spyOn(api, 'getCommunity').mockResolvedValue(nord)

    const router = makeRouter()
    // Commits and starts the fire-and-forget selection write, held open below.
    await router.push('/c/nord/')

    const nav = router.push('/')
    await flushPromises()
    // The write hasn't settled yet — the landing guard must not have raced ahead to
    // read the (stale) selection.
    expect(getSelection).not.toHaveBeenCalled()

    releaseSelectionWrite()
    await nav
    expect(getSelection).toHaveBeenCalledTimes(1)
    // Resolves back to 'nord' — the community just switched to, not whatever the
    // selection said before this write landed.
    expect(slugParam(router)).toBe('nord')
  })

  it('leaves no in-flight selection write behind on reset, so a later landing resolution is not blocked', async () => {
    // Mirrors this file's own test-isolation hazard: a spec that leaves a selection write
    // unresolved (like the one above, if it failed before releasing it) must not leave a
    // never-settling promise sitting in the module slot for the *next* test's beforeEach
    // to skip over — otherwise every later '/' resolution in this file awaits forever.
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: 'c1', name: 'Team Süd', slug: 'team' },
    ])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    vi.spyOn(api, 'setSelection').mockReturnValue(new Promise<void>(() => {})) // never settles

    const router = makeRouter()
    await router.push('/c/team/')
    await flushPromises() // the never-settling write is now in the module slot

    _resetRouteDataState() // what every beforeEach does between test cases

    let timedOut = false
    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        timedOut = true
        resolve()
      }, 50)
    })
    await Promise.race([resolveLandingTarget(), timeout])
    expect(timedOut).toBe(false)
  })
})
