import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import * as client from '@/api/client'
import { ApiError } from '@/api/client'
import { useAuth, _resetAuthState } from '@/auth/useAuth'
import type { CommunityResponse } from '@/api/types'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: push }) }))
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof client>()),
  apiFetch: vi.fn(),
}))
const apiFetch = vi.mocked(client.apiFetch)

// The guard runs for real in this spec (it's a plain onMounted hook, not route-level), so every
// mount needs a session cleared to create — otherwise it would redirect before the page's own
// behaviour could be observed. Bootstrap it the way the app does: mocked apiFetch, real useAuth.
async function mountNewPage() {
  apiFetch.mockResolvedValue({
    id: 'u1',
    username: 'Alice',
    githubLogin: 'alice',
    githubName: null,
    email: null,
    bgColorHex: null,
    avatar: { shortName: 'ALIC', bgColorHex: '#8e44ad' },
    isSuperAdmin: false,
    mayCreateCommunities: true,
    createdAt: null,
  })
  await useAuth().bootstrap()
  const New = (await import('@/pages/communities/new.vue')).default
  return mount(New)
}

describe('create community page', () => {
  beforeEach(() => {
    push.mockReset()
    apiFetch.mockReset()
    _resetAuthState()
  })

  it('shows the live slug preview as the user types', async () => {
    const w = await mountNewPage()
    await w.find('input').setValue('Hütte Hütte')
    expect(w.text()).toContain('/c/huette-huette/')
  })

  it('surfaces a 409 as a friendly message', async () => {
    vi.spyOn(api, 'createCommunity').mockRejectedValue(new ApiError(409, 'taken'))
    const w = await mountNewPage()
    await w.find('input').setValue('Team A')
    await w.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(w.text()).toMatch(/bereits vergeben|Namen anpassen/i)
    expect(push).not.toHaveBeenCalled()
  })

  it('guards the route and shows the submit button as busy while creating', async () => {
    // Deferred so the in-flight state is observable before the call settles.
    let resolve!: (c: CommunityResponse) => void
    vi.spyOn(api, 'createCommunity').mockReturnValue(
      new Promise<CommunityResponse>((res) => {
        resolve = res
      }),
    )
    const w = await mountNewPage()

    await w.find('input#name').setValue('Team A')
    await w.find('form').trigger('submit')

    const button = w.find('button[type=submit]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.find('[data-test=spinner]').exists()).toBe(true)

    resolve({
      id: 'c1',
      name: 'Team A',
      slug: 'team-a',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      gamesFromRound: null,
      viewerIsAdmin: true,
      pendingCount: 0,
      editionFrozen: false,
    })
    await flushPromises()
    expect(w.find('button[type=submit]').attributes('aria-busy')).toBe('false')
  })
})
