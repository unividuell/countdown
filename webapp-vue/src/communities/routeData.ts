import { ref } from 'vue'
import type { Router } from 'vue-router'
import { ApiError } from '@/api/client'
import { getCommunity, setSelection } from '@/api/communities'
import type { CommunityResponse } from '@/api/types'
import { activeCommunity } from '@/communities/context'

export type CommunityRouteState =
  { kind: 'ready'; community: CommunityResponse } | { kind: 'no-access' } | { kind: 'error' }

export const communityRoute = ref<CommunityRouteState | null>(null)

/** The single write path into the header state — the guard and the shell's refresh() share it. */
export function publishCommunity(c: CommunityResponse): void {
  communityRoute.value = { kind: 'ready', community: c }
  activeCommunity.value = {
    slug: c.slug,
    name: c.name,
    startsAt: c.startsAt,
    startsAtTimezone: c.startsAtTimezone,
    viewerIsAdmin: c.viewerIsAdmin,
    pendingCount: c.pendingCount,
  }
}

function slugOf(route: { params: Record<string, unknown> }): string | null {
  const s = route.params.slug
  return typeof s === 'string' && s.length > 0 ? s : null
}

async function load(slug: string): Promise<CommunityRouteState> {
  try {
    return { kind: 'ready', community: await getCommunity(slug) }
  } catch (e) {
    return e instanceof ApiError && e.status === 404 ? { kind: 'no-access' } : { kind: 'error' }
  }
}

export function registerCommunityDataGuard(router: Router): void {
  let seq = 0
  let pending: { slug: string; state: CommunityRouteState } | null = null

  // Read before the commit: the destination's data is fetched while the current view
  // stays untouched on screen. Never blocks the navigation — a 404 or a network error
  // is a render state, so the URL and the header stay in agreement with each other.
  router.beforeResolve(async (to) => {
    const slug = slugOf(to)
    if (!slug) return true
    const current = communityRoute.value
    if (current?.kind === 'ready' && current.community.slug === slug) return true

    const mine = ++seq
    const state = await load(slug)
    if (mine !== seq) return true // a newer navigation owns the state now
    pending = { slug, state }
    return true
  })

  // Write after the commit. Skipping failures (aborted, cancelled, duplicated) is what
  // makes a redirect back to the route we are already on a genuine no-op.
  router.afterEach((to, _from, failure) => {
    if (failure) return
    const slug = slugOf(to)
    if (!slug) {
      pending = null
      communityRoute.value = null
      activeCommunity.value = null
      return
    }
    if (pending?.slug !== slug) return
    const { state } = pending
    pending = null
    if (state.kind !== 'ready') {
      communityRoute.value = state
      activeCommunity.value = null
      return
    }
    publishCommunity(state.community)
    // A "last visited" marker only — losing it must never affect the navigation.
    setSelection(state.community.id).catch((e) =>
      console.error('could not persist the community selection', e),
    )
  })
}

/** Test-only: reset the module-level singleton between test cases. */
export function _resetRouteDataState(): void {
  communityRoute.value = null
}
