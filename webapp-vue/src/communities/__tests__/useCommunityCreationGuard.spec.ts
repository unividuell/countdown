import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import * as client from '@/api/client'
import { useCommunityCreationGuard } from '@/communities/useCommunityCreationGuard'
import { useAuth, _resetAuthState } from '@/auth/useAuth'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof client>()),
  apiFetch: vi.fn(),
}))
const apiFetch = vi.mocked(client.apiFetch)

const Host = defineComponent({
  setup() {
    useCommunityCreationGuard()
    return () => null
  },
})

async function signIn(mayCreateCommunities: boolean): Promise<void> {
  apiFetch.mockResolvedValue({
    id: 'u1',
    username: 'Alice',
    githubLogin: 'alice',
    githubName: null,
    email: null,
    bgColorHex: null,
    avatar: { shortName: 'ALIC', bgColorHex: '#8e44ad' },
    isSuperAdmin: false,
    mayCreateCommunities,
    createdAt: null,
  })
  await useAuth().bootstrap()
}

describe('useCommunityCreationGuard', () => {
  beforeEach(() => {
    replace.mockReset()
    apiFetch.mockReset()
    _resetAuthState()
  })

  it('redirects a viewer without the clearance', async () => {
    await signIn(false)
    mount(Host)
    expect(replace).toHaveBeenCalledWith('/communities')
  })

  it('lets a cleared viewer through', async () => {
    await signIn(true)
    mount(Host)
    expect(replace).not.toHaveBeenCalled()
  })

  it('redirects when there is no session at all', async () => {
    mount(Host)
    expect(replace).toHaveBeenCalledWith('/communities')
  })
})
