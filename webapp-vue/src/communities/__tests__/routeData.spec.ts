import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'
import type { CommunityResponse } from '@/api/types'
import { activeCommunity } from '@/communities/context'
import {
  _resetRouteDataState,
  communityRoute,
  publishCommunity,
  registerCommunityDataGuard,
} from '@/communities/routeData'

const Stub = defineComponent({ render: () => h('div') })

function community(over: Partial<CommunityResponse> = {}): CommunityResponse {
  return {
    id: 'c1',
    name: 'Team Süd',
    slug: 'team',
    startsAt: null,
    startsAtTimezone: 'Europe/Berlin',
    phaseTwoStartRound: null,
    viewerIsAdmin: false,
    pendingCount: 0,
    ...over,
  }
}
const nord = community({ id: 'c2', name: 'Team Nord', slug: 'nord' })
const west = community({ id: 'c3', name: 'Team West', slug: 'west' })

// Mirrors the file-based layout: a `/[slug]` shell record with child routes.
function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/communities', component: Stub },
      {
        path: '/:slug',
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
    await router.push('/team/')
    expect(communityRoute.value).toEqual({ kind: 'ready', community: community() })
    expect(activeCommunity.value).toMatchObject({ slug: 'team', name: 'Team Süd' })
  })

  it('persists the selection as a last-visited marker', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const select = vi.mocked(api.setSelection)
    const router = makeRouter()
    await router.push('/team/')
    await flushPromises()
    expect(select).toHaveBeenCalledWith('c1')
  })

  it('keeps the current community in the header while the next one is still loading', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValueOnce(community())
    const router = makeRouter()
    await router.push('/team/')

    let release!: (c: CommunityResponse) => void
    get.mockReturnValueOnce(
      new Promise<CommunityResponse>((r) => {
        release = r
      }),
    )
    const nav = router.push('/nord/')
    await flushPromises()

    // Mid-flight the user still sees the old page, so the header must still describe it.
    expect(activeCommunity.value?.slug).toBe('team')
    expect(router.currentRoute.value.params.slug).toBe('team')

    release(nord)
    await nav
    expect(activeCommunity.value?.slug).toBe('nord')
  })

  it('discards a superseded fetch', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValueOnce(community())
    const router = makeRouter()
    await router.push('/team/')

    let releaseNord!: (c: CommunityResponse) => void
    get.mockReturnValueOnce(
      new Promise<CommunityResponse>((r) => {
        releaseNord = r
      }),
    )
    const navNord = router.push('/nord/')
    await flushPromises()

    get.mockResolvedValueOnce(west)
    await router.push('/west/')

    releaseNord(nord)
    await navNord
    await flushPromises()
    expect(activeCommunity.value?.slug).toBe('west')
    expect(router.currentRoute.value.params.slug).toBe('west')
  })

  it('does not refetch when moving between sub-routes of one community', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const router = makeRouter()
    await router.push('/team/')
    await router.push('/team/members')
    expect(get).toHaveBeenCalledTimes(1)
    expect(activeCommunity.value?.slug).toBe('team')
  })

  it('refetches when the slug changes', async () => {
    const get = vi.spyOn(api, 'getCommunity')
    get.mockResolvedValueOnce(community()).mockResolvedValueOnce(nord)
    const router = makeRouter()
    await router.push('/team/')
    await router.push('/nord/')
    expect(get).toHaveBeenCalledTimes(2)
    expect(activeCommunity.value?.name).toBe('Team Nord')
  })

  it('clears the header when leaving the community area', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const router = makeRouter()
    await router.push('/team/')
    await router.push('/communities')
    expect(communityRoute.value).toBeNull()
    expect(activeCommunity.value).toBeNull()
  })

  it('reports no-access on 404, commits the URL, and clears the header', async () => {
    vi.spyOn(api, 'getCommunity').mockRejectedValue(new ApiError(404, 'no access'))
    const router = makeRouter()
    await router.push('/ghost/')
    expect(communityRoute.value).toEqual({ kind: 'no-access' })
    expect(router.currentRoute.value.params.slug).toBe('ghost')
    // A failed switch must not leave the previous community's admin links and
    // pending dot standing in the header.
    expect(activeCommunity.value).toBeNull()
  })

  it('reports a generic error for a non-404 failure', async () => {
    vi.spyOn(api, 'getCommunity').mockRejectedValue(new ApiError(500, 'boom'))
    const router = makeRouter()
    await router.push('/team/')
    expect(communityRoute.value).toEqual({ kind: 'error' })
  })

  it('leaves the header untouched and does not refetch on a duplicated navigation', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const router = makeRouter()
    await router.push('/team/')
    expect(get).toHaveBeenCalledTimes(1)

    // Task 4's landing redirect produces exactly this shape: a push back to the
    // route we are already on. vue-router resolves it as a 'duplicated' failure
    // without ever running our guards — the header must stay exactly as it was.
    const duplicate = await router.push('/team/')
    expect(duplicate).toBeTruthy()
    expect(get).toHaveBeenCalledTimes(1)
    expect(communityRoute.value).toEqual({ kind: 'ready', community: community() })
    expect(activeCommunity.value).toMatchObject({ slug: 'team', name: 'Team Süd' })
  })

  it('does not let a stale pending fetch from an aborted navigation leak into a later same-slug navigation', async () => {
    const get = vi.spyOn(api, 'getCommunity')
    get.mockResolvedValueOnce(community()).mockResolvedValueOnce(nord)
    const router = makeRouter()
    await router.push('/team/')
    await router.push('/nord/')
    expect(activeCommunity.value?.slug).toBe('nord')

    // A second beforeResolve guard, registered after our data guard, aborts one
    // specific navigation back to /team/ — but only after our guard has already
    // run and written its `pending` slot.
    let abortNextTeamNav = false
    router.beforeResolve((to) => (abortNextTeamNav && to.path === '/team/' ? false : true))

    get.mockResolvedValueOnce(community({ pendingCount: 99 })) // the aborted fetch's stale payload
    abortNextTeamNav = true
    const aborted = await router.push('/team/')
    abortNextTeamNav = false
    expect(aborted).toBeTruthy() // NavigationFailure (aborted)
    // Aborted: the URL and header stay exactly on 'nord'.
    expect(router.currentRoute.value.params.slug).toBe('nord')
    expect(activeCommunity.value?.slug).toBe('nord')

    // Simulate Task 3's second publishCommunity call site (the shell's refresh())
    // publishing fresher 'team' data out of band, i.e. NOT through this guard.
    publishCommunity(community({ pendingCount: 0 }))

    // A later, unrelated navigation to the same slug takes the "already ready"
    // shortcut (no fetch) — the earlier aborted fetch's stale pending must not
    // silently overwrite the fresher data just published above.
    await router.push('/team/')
    expect(get).toHaveBeenCalledTimes(3)
    expect(communityRoute.value).toEqual({
      kind: 'ready',
      community: community({ pendingCount: 0 }),
    })
  })
})
