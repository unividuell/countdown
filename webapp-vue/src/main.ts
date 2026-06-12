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
setUnauthorizedHandler(() => void router.push('/login'))

const { bootstrap } = useAuth()
// Resolve the session before mounting so the guard never sees 'unknown'.
bootstrap().finally(() => {
  createApp(App).use(router).mount('#app')
})
