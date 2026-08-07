import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as client from '@/api/client'
import * as communitiesApi from '@/api/communities'
import { _resetCommunitiesState } from '@/communities/useCommunities'
import { useAuth, _resetAuthState } from '@/auth/useAuth'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof client>()),
  apiFetch: vi.fn(),
}))
const apiFetch = vi.mocked(client.apiFetch)

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

async function page() {
  const Page = (await import('@/pages/communities/index.vue')).default
  const w = mount(Page)
  await flushPromises()
  return w
}

describe('own communities page', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    _resetAuthState()
    _resetCommunitiesState()
    // No memberships, so both cases land on the empty state — which is what has to branch.
    vi.spyOn(communitiesApi, 'listCommunities').mockResolvedValue([])
  })

  it('offers creating a community to a cleared viewer', async () => {
    await signIn(true)
    const w = await page()

    expect(w.find('a[href="/communities/new"]').exists()).toBe(true)
    expect(w.text()).toContain('Erstelle eine')
  })

  it('hides the entry point and the invitation to create it from an uncleared viewer', async () => {
    await signIn(false)
    const w = await page()

    expect(w.find('a[href="/communities/new"]').exists()).toBe(false)
    // The empty state must not point at a button that is not there.
    expect(w.text()).not.toContain('Erstelle eine')
    expect(w.text()).toContain('Öffne einen Einladungslink')
  })
})
