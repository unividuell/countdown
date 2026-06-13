import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'

vi.mock('@/api/client', async (orig) => {
  const actual = await orig<typeof import('@/api/client')>()
  return { ...actual, apiFetch: vi.fn() }
})
import { apiFetch } from '@/api/client'
import { useAuth, _resetAuthState } from '@/auth/useAuth'

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

describe('useAuth', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
    _resetAuthState()
  })
  afterEach(() => vi.restoreAllMocks())

  it('bootstrap sets authenticated + user on 200', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(me)
    const auth = useAuth()
    await auth.bootstrap()
    expect(auth.status.value).toBe('authenticated')
    expect(auth.user.value).toEqual(me)
  })

  it('bootstrap sets anonymous on 401', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(401, 'unauthorized'))
    const auth = useAuth()
    await auth.bootstrap()
    expect(auth.status.value).toBe('anonymous')
    expect(auth.user.value).toBeNull()
  })

  it('bootstrap rethrows non-401 errors', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(500, 'boom'))
    const auth = useAuth()
    await expect(auth.bootstrap()).rejects.toBeInstanceOf(ApiError)
  })

  it('navigates to the server login entry (server decides github vs test picker)', () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign } as unknown as Location)
    useAuth().loginWithGitHub()
    expect(assign).toHaveBeenCalledWith('/login/github')
  })

  it('logout posts and resets to anonymous', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(me)
    const auth = useAuth()
    await auth.bootstrap()
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined)
    await auth.logout()
    expect(apiFetch).toHaveBeenLastCalledWith('/logout', { method: 'POST' })
    expect(auth.status.value).toBe('anonymous')
    expect(auth.user.value).toBeNull()
  })

  it('markAnonymous resets an authenticated session', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(me)
    const auth = useAuth()
    await auth.bootstrap()
    expect(auth.status.value).toBe('authenticated')
    auth.markAnonymous()
    expect(auth.status.value).toBe('anonymous')
    expect(auth.user.value).toBeNull()
  })
})
