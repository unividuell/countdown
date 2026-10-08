import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'

const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  useRoute: () => ({ params: { token: 'A7K2MP' }, fullPath: '/join/A7K2MP' }),
}))

const { auth, stash } = vi.hoisted(() => ({
  auth: {
    status: { value: 'authenticated' as 'authenticated' | 'anonymous' },
    loginWithGitHub: vi.fn(),
  },
  stash: vi.fn(),
}))
vi.mock('@/auth/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/auth/postLoginRedirect', () => ({ stashPostLoginRedirect: stash }))

// A fresh vi.spyOn on an already-spied api function reuses that spy's call history —
// without this, the "signed in" tests' joinByToken calls leak into the "signed out"
// describe's not.toHaveBeenCalled() assertion.
afterEach(() => vi.restoreAllMocks())

const page = async () => (await import('@/pages/join/[token].vue')).default

describe('join page — signed in', () => {
  beforeEach(() => {
    replace.mockReset()
    auth.status.value = 'authenticated'
  })

  it('shows waiting on JOINED_PENDING', async () => {
    vi.spyOn(api, 'joinByToken').mockResolvedValue({
      status: 'JOINED_PENDING',
      name: 'Team',
      slug: 'team',
    })
    const w = mount(await page())
    await flushPromises()
    expect(w.text()).toMatch(/Bestätigung|Team/)
  })

  it('redirects on ALREADY_ACTIVE', async () => {
    vi.spyOn(api, 'joinByToken').mockResolvedValue({
      status: 'ALREADY_ACTIVE',
      name: 'Team',
      slug: 'team',
    })
    mount(await page())
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/c/team/')
  })

  it('shows expired on 410', async () => {
    vi.spyOn(api, 'joinByToken').mockRejectedValue(new ApiError(410, 'gone'))
    const w = mount(await page())
    await flushPromises()
    expect(w.text()).toMatch(/abgelaufen/i)
  })
})

describe('join page — signed out', () => {
  beforeEach(() => {
    auth.status.value = 'anonymous'
    auth.loginWithGitHub.mockReset()
    stash.mockReset()
  })

  it('names the inviting community instead of joining', async () => {
    const join = vi.spyOn(api, 'joinByToken')
    vi.spyOn(api, 'getInviteName').mockResolvedValue({ name: 'Hütte Hütte' })
    const w = mount(await page())
    await flushPromises()
    expect(w.text()).toContain('Hütte Hütte')
    expect(join).not.toHaveBeenCalled()
  })

  it('remembers the destination before sending the visitor to GitHub', async () => {
    vi.spyOn(api, 'getInviteName').mockResolvedValue({ name: 'Hütte Hütte' })
    const w = mount(await page())
    await flushPromises()
    await w.get('[data-test="join-accept"]').trigger('click')
    expect(stash).toHaveBeenCalledWith('/join/A7K2MP')
    expect(auth.loginWithGitHub).toHaveBeenCalled()
  })

  it('shows the invalid message on 404', async () => {
    vi.spyOn(api, 'getInviteName').mockRejectedValue(new ApiError(404, 'nope'))
    const w = mount(await page())
    await flushPromises()
    expect(w.text()).toMatch(/ungültig/i)
  })
})
