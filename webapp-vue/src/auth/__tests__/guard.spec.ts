import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import { ApiError } from '@/api/client'

vi.mock('@/api/client', async (orig) => {
  const actual = await orig<typeof import('@/api/client')>()
  return { ...actual, apiFetch: vi.fn() }
})
import { apiFetch } from '@/api/client'
import { _resetAuthState, useAuth } from '@/auth/useAuth'
import { registerAuthGuard } from '@/auth/guard'

const Stub = defineComponent({ render: () => h('div') })
const me = {
  id: 'u1',
  username: 'octo',
  githubLogin: 'octo',
  githubName: null,
  email: null,
  bgColorHex: null,
  isSuperAdmin: false,
  createdAt: null,
}

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/login', component: Stub, meta: { public: true } },
      { path: '/join/:token', component: Stub },
    ],
  })
  registerAuthGuard(router)
  return router
}

describe('auth guard', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
    _resetAuthState()
    sessionStorage.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('redirects an anonymous user from a protected route to /login', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(401, 'unauthorized'))
    await useAuth().bootstrap()
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('redirects an authenticated user away from /login to /', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(me)
    await useAuth().bootstrap()
    const router = makeRouter()
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('fails closed: unknown status is blocked from protected routes', async () => {
    const router = makeRouter() // no bootstrap -> status stays 'unknown'
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('allows an authenticated user into a protected route', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(me)
    await useAuth().bootstrap()
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('stashes the intended destination when bouncing an anonymous user to login', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(401, 'unauthorized'))
    await useAuth().bootstrap()
    const router = makeRouter()
    await router.push('/join/tok123')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(sessionStorage.getItem('postLoginRedirect')).toBe('/join/tok123')
  })
})
