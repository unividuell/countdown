import { ref } from 'vue'
import type { Router } from 'vue-router'
import { consumePostLoginRedirect } from '@/auth/postLoginRedirect'
import { pendingSelectionWrite } from '@/communities/routeData'
import { useCommunities } from '@/communities/useCommunities'

/** Set when the landing resolution failed, so '/' renders a retry rather than hanging. */
export const landingFailed = ref(false)

/** The path '/' should redirect to, or null when it could not be determined. */
export async function resolveLandingTarget(): Promise<string | null> {
  // A user bounced to login from a specific destination (e.g. /join/<token>) returns
  // there rather than to the default landing.
  const stashed = consumePostLoginRedirect()
  if (stashed) return stashed
  // A community switch persists its selection fire-and-forget after it commits (see
  // `routeData.ts`). Racing ahead of that write here would read the *previous*
  // selection and could redirect back to the community the user just left.
  if (pendingSelectionWrite) await pendingSelectionWrite.catch(() => {})
  try {
    const l = await useCommunities().landing()
    return l.kind === 'none' || l.kind === 'choose' ? '/communities' : `/${l.slug}/`
  } catch (e) {
    console.error('could not resolve the landing destination', e)
    return null
  }
}

export function registerLandingRedirect(router: Router): void {
  router.beforeResolve(async (to) => {
    if (to.path !== '/') return true
    const target = await resolveLandingTarget()
    landingFailed.value = target === null
    // On failure the navigation is admitted so index.vue can show the retry; the
    // resolved target never is '/', so this cannot loop.
    return target ?? true
  })
}

/** Test-only: reset the module-level singleton between test cases. */
export function _resetLandingState(): void {
  landingFailed.value = false
}
