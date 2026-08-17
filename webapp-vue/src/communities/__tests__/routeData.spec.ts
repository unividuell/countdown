import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'
import type { CommunityResponse } from '@/api/types'
import { activeCommunity } from '@/communities/context'
import { resolveLandingTarget } from '@/communities/landingGuard'
import {
  _resetRouteDataState,
  communityRoute,
  publishCommunity,
  registerCommunityDataGuard,
} from '@/communities/routeData'
import { slugParam } from './routerTestUtils'

const Stub = defineComponent({ render: () => h('div') })

function community(over: Partial<CommunityResponse> = {}): CommunityResponse {
  return {
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
    viewerIdentity: null,
    ...over,
  }
}
const nord = community({ id: 'c2', name: 'Team Nord', slug: 'nord' })
const west = community({ id: 'c3', name: 'Team West', slug: 'west' })

// Mirrors the file-based layout: a `/c/[slug]` shell record with child routes.
function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/communities', component: Stub },
      {
        path: '/c/:slug',
        component: Stub,
        children: [
          { path: '', component: Stub },
          { path: 'members', component: Stub },
        ],
      },
    ],
  })
  registerCommunityDataGuard(router)
  return router
}

describe('community route data guard', () => {
  beforeEach(() => {
    _resetRouteDataState()
    activeCommunity.value = null
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
  })
  afterEach(() => vi.restoreAllMocks())

  it('publishes the community into the header state once the navigation commits', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const router = makeRouter()
    await router.push('/c/team/')
    expect(communityRoute.value).toEqual({ kind: 'ready', community: community() })
    expect(activeCommunity.value).toMatchObject({ slug: 'team', name: 'Team Süd' })
  })

  it('persists the selection as a last-visited marker', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const select = vi.mocked(api.setSelection)
    const router = makeRouter()
    await router.push('/c/team/')
    await flushPromises()
    expect(select).toHaveBeenCalledWith('c1')
  })

  it('navigates even when the selection cannot be persisted', async () => {
    // The selection write is fire-and-forget after the navigation commits.
    // A rejection must not undo or block the navigation — it is only an internal
    // optimization (a "last visited" marker for resumption). The guard's .catch
    // silences it. This test verifies that guard is essential: if a future edit
    // removes the .catch or makes the guard await the persist, the navigation would
    // regress silently without this test catching it.
    vi.spyOn(api, 'getCommunity').mockResolvedValue(nord)
    vi.spyOn(api, 'setSelection').mockRejectedValue(new Error('offline'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = makeRouter()
    await router.push('/c/nord/')
    await flushPromises()
    expect(slugParam(router)).toBe('nord')
    expect(communityRoute.value).toEqual({ kind: 'ready', community: nord })
    expect(activeCommunity.value?.slug).toBe('nord')
    expect(errorSpy).toHaveBeenCalledWith(
      'could not persist the community selection',
      expect.any(Error),
    )
  })

  it('keeps the current community in the header while the next one is still loading', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValueOnce(community())
    const router = makeRouter()
    await router.push('/c/team/')

    let release!: (c: CommunityResponse) => void
    get.mockReturnValueOnce(
      new Promise<CommunityResponse>((r) => {
        release = r
      }),
    )
    const nav = router.push('/c/nord/')
    await flushPromises()

    // Mid-flight the user still sees the old page, so the header must still describe it.
    expect(activeCommunity.value?.slug).toBe('team')
    expect(slugParam(router)).toBe('team')

    release(nord)
    await nav
    expect(activeCommunity.value?.slug).toBe('nord')
  })

  it('discards a superseded fetch', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValueOnce(community())
    const router = makeRouter()
    await router.push('/c/team/')

    let releaseNord!: (c: CommunityResponse) => void
    get.mockReturnValueOnce(
      new Promise<CommunityResponse>((r) => {
        releaseNord = r
      }),
    )
    const navNord = router.push('/c/nord/')
    await flushPromises()

    get.mockResolvedValueOnce(west)
    await router.push('/c/west/')

    releaseNord(nord)
    await navNord
    await flushPromises()
    expect(activeCommunity.value?.slug).toBe('west')
    expect(slugParam(router)).toBe('west')
  })

  it('does not refetch when moving between sub-routes of one community', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const router = makeRouter()
    await router.push('/c/team/')
    await router.push('/c/team/members')
    expect(get).toHaveBeenCalledTimes(1)
    expect(activeCommunity.value?.slug).toBe('team')
  })

  it('refetches when the slug changes', async () => {
    const get = vi.spyOn(api, 'getCommunity')
    get.mockResolvedValueOnce(community()).mockResolvedValueOnce(nord)
    const router = makeRouter()
    await router.push('/c/team/')
    await router.push('/c/nord/')
    expect(get).toHaveBeenCalledTimes(2)
    expect(activeCommunity.value?.name).toBe('Team Nord')
  })

  it('clears the header when leaving the community area', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const router = makeRouter()
    await router.push('/c/team/')
    await router.push('/communities')
    expect(communityRoute.value).toBeNull()
    expect(activeCommunity.value).toBeNull()
  })

  it('reports no-access on 404, commits the URL, and clears the header', async () => {
    vi.spyOn(api, 'getCommunity').mockRejectedValue(new ApiError(404, 'no access'))
    const router = makeRouter()
    await router.push('/c/ghost/')
    expect(communityRoute.value).toEqual({ kind: 'no-access' })
    expect(slugParam(router)).toBe('ghost')
    // A failed switch must not leave the previous community's admin links and
    // pending dot standing in the header.
    expect(activeCommunity.value).toBeNull()
  })

  it('reports a generic error for a non-404 failure', async () => {
    vi.spyOn(api, 'getCommunity').mockRejectedValue(new ApiError(500, 'boom'))
    const router = makeRouter()
    await router.push('/c/team/')
    expect(communityRoute.value).toEqual({ kind: 'error' })
  })

  it('leaves the header untouched and does not refetch on a duplicated navigation', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const router = makeRouter()
    await router.push('/c/team/')
    expect(get).toHaveBeenCalledTimes(1)

    // Task 4's landing redirect produces exactly this shape: a push back to the
    // route we are already on. vue-router resolves it as a 'duplicated' failure
    // without ever running our guards — the header must stay exactly as it was.
    const duplicate = await router.push('/c/team/')
    expect(duplicate).toBeTruthy()
    expect(get).toHaveBeenCalledTimes(1)
    expect(communityRoute.value).toEqual({ kind: 'ready', community: community() })
    expect(activeCommunity.value).toMatchObject({ slug: 'team', name: 'Team Süd' })
  })

  it('does not let an older selection write clear the slot while a newer one is still in flight', async () => {
    // Two switches in quick succession: team's write (A) is still in flight when nord's
    // write (B) starts. If A's `.finally` clears the module slot unconditionally, a
    // landing resolution racing in right after A settles would skip the await on B and
    // could read the stale (pre-switch) selection.
    vi.spyOn(api, 'getCommunity').mockResolvedValueOnce(community()).mockResolvedValueOnce(nord)
    const select = vi.mocked(api.setSelection)
    let releaseA!: () => void
    let releaseB!: () => void
    select
      .mockReturnValueOnce(new Promise<void>((r) => (releaseA = r)))
      .mockReturnValueOnce(new Promise<void>((r) => (releaseB = r)))

    const router = makeRouter()
    await router.push('/c/team/')
    await flushPromises()
    await router.push('/c/nord/')
    await flushPromises()

    // Settle the older write (A) first — the slot must stay owned by B.
    releaseA()
    await flushPromises()

    vi.spyOn(api, 'listCommunities').mockResolvedValue([])
    const getSelection = vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    const landing = resolveLandingTarget()
    await flushPromises()
    // B is still pending — the landing guard must still be waiting on it.
    expect(getSelection).not.toHaveBeenCalled()

    releaseB()
    await landing
    expect(getSelection).toHaveBeenCalledTimes(1)
  })

  it('does not let a stale pending fetch from an aborted navigation leak into a later same-slug navigation', async () => {
    const get = vi.spyOn(api, 'getCommunity')
    get.mockResolvedValueOnce(community()).mockResolvedValueOnce(nord)
    const router = makeRouter()
    await router.push('/c/team/')
    await router.push('/c/nord/')
    expect(activeCommunity.value?.slug).toBe('nord')

    // A second beforeResolve guard, registered after our data guard, aborts one
    // specific navigation back to /c/team/ — but only after our guard has already
    // run and written its `pending` slot.
    let abortNextTeamNav = false
    router.beforeResolve((to) => (abortNextTeamNav && to.path === '/c/team/' ? false : true))

    get.mockResolvedValueOnce(community({ pendingCount: 99 })) // the aborted fetch's stale payload
    abortNextTeamNav = true
    const aborted = await router.push('/c/team/')
    abortNextTeamNav = false
    expect(aborted).toBeTruthy() // NavigationFailure (aborted)
    // Aborted: the URL and header stay exactly on 'nord'.
    expect(slugParam(router)).toBe('nord')
    expect(activeCommunity.value?.slug).toBe('nord')

    // Simulate Task 3's second publishCommunity call site (the shell's refresh())
    // publishing fresher 'team' data out of band, i.e. NOT through this guard.
    publishCommunity(community({ pendingCount: 0 }))

    // A later, unrelated navigation to the same slug takes the "already ready"
    // shortcut (no fetch) — the earlier aborted fetch's stale pending must not
    // silently overwrite the fresher data just published above.
    await router.push('/c/team/')
    expect(get).toHaveBeenCalledTimes(3)
    expect(communityRoute.value).toEqual({
      kind: 'ready',
      community: community({ pendingCount: 0 }),
    })
  })
})
