import type { Router } from 'vue-router'
import { useAuth } from '@/auth/useAuth'

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
    if (!isPublic && status.value !== 'authenticated') return { path: '/login' }
    if (to.path === '/login' && status.value === 'authenticated') return { path: '/' }
    return true
  })
}
