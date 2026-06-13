import type { Router } from 'vue-router'
import { useAuth } from '@/auth/useAuth'
import { stashPostLoginRedirect } from '@/auth/postLoginRedirect'

// Convention: routes are auth-required unless they set `meta.public = true`.
// Fail closed: only an explicitly 'authenticated' status may enter a protected route.
// `status` is resolved (authenticated|anonymous) before the router mounts
// (main.ts awaits bootstrap), so 'unknown' is a safety net, not the normal flow.
// NOTE: the redirect target '/login' MUST be a public route (meta.public = true),
// otherwise an anonymous user loops; the login page declares that.
export function registerAuthGuard(router: Router): void {
  const { status } = useAuth()
  router.beforeEach((to) => {
    const isPublic = to.meta.public === true
    if (!isPublic && status.value !== 'authenticated') {
      // Remember the intended destination (e.g. /join/<token>) so the post-login
      // resolver can return there — login is a full-page round-trip, so this is
      // stashed in sessionStorage (see postLoginRedirect). Without it, accepting an
      // invite while logged out lands on the normal home instead of the join page.
      stashPostLoginRedirect(to.fullPath)
      return { path: '/login' }
    }
    if (to.path === '/login' && status.value === 'authenticated') return { path: '/' }
    return true
  })
}
