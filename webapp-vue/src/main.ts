import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import App from './App.vue'
import { useAuth } from '@/auth/useAuth'
import { registerAuthGuard } from '@/auth/guard'
import { registerLandingRedirect } from '@/communities/landingGuard'
import { registerCommunityDataGuard } from '@/communities/routeData'
import { registerNavigationProgress } from '@/ui/navigationProgress'
import { setUnauthorizedHandler } from '@/api/client'
import './assets/main.css'

const router = createRouter({
  history: createWebHistory(),
  routes,
  // A hash is always a round card's own anchor (`RoundCard`), which is where closing a single tip
  // comes back to. The element is checked first because the history it sits in loads
  // asynchronously: if it is not there yet, the top of the page is what we had anyway.
  // `savedPosition` has to be honoured explicitly — defining this hook at all switches the
  // browser's own back/forward restoration off.
  scrollBehavior: (to, _from, savedPosition) => {
    if (savedPosition) return savedPosition
    if (to.hash && document.querySelector(to.hash)) return { el: to.hash }
    return { top: 0 }
  },
})
registerAuthGuard(router)
// beforeResolve hooks run in registration order: the landing redirect must claim '/'
// before anything downstream reacts to a route that is about to be replaced.
registerLandingRedirect(router)
registerCommunityDataGuard(router)
registerNavigationProgress(router)

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
    // router.isReady() only settles once the initial navigation has run, and that is
    // kicked off by router.install() — so the router must be installed on the app
    // BEFORE awaiting it, or this hangs forever. Mounting afterwards means the first
    // paint already carries the resolved community instead of flashing the app name.
    const app = createApp(App).use(router)
    router
      .isReady()
      .catch((err: unknown) => console.error('[router] initial navigation failed:', err))
      .finally(() => app.mount('#app'))
  })
