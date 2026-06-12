import type { Router } from 'vue-router'
import { useAuth } from '@/auth/useAuth'

// Convention: routes are auth-required unless they set `meta.public = true`.
export function registerAuthGuard(router: Router): void {
  router.beforeEach((to) => {
    const { status } = useAuth()
    const isPublic = to.meta.public === true
    if (!isPublic && status.value === 'anonymous') return { path: '/login' }
    if (to.path === '/login' && status.value === 'authenticated') return { path: '/' }
    return true
  })
}
