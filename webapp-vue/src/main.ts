import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import App from './App.vue'
import { useAuth } from '@/auth/useAuth'
import { registerAuthGuard } from '@/auth/guard'
import { setUnauthorizedHandler } from '@/api/client'
import './assets/main.css'

const router = createRouter({ history: createWebHistory(), routes })
registerAuthGuard(router)

const { bootstrap, markAnonymous } = useAuth()
setUnauthorizedHandler(() => {
  // 401 = dead session: drop local auth state, then route to login so the guard
  // (which only admits 'authenticated') doesn't bounce the user back.
  markAnonymous()
  void router.push('/login')
})
// Resolve the session before mounting so the guard never sees 'unknown'.
bootstrap()
  .catch((err: unknown) => {
    // Backend unreachable / unexpected error: status stays 'unknown' and the guard
    // routes to /login. Log it so it surfaces in error monitoring rather than as an
    // unhandled promise rejection.
    console.error('[bootstrap] failed to resolve session:', err)
  })
  .finally(() => {
    createApp(App).use(router).mount('#app')
  })
