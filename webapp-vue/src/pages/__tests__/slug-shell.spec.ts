import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/useAuth'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'team' } }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  RouterView: { template: '<div>child</div>' },
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))

vi.mock('@/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('community shell guard', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { value: null } as never,
      status: { value: 'authenticated' } as never,
      bootstrap: vi.fn(),
      loginWithGitHub: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      markAnonymous: vi.fn(),
    })
  })

  it('renders when an active member', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: false,
      pendingCount: 0,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    vi.spyOn(api, 'listCommunities').mockResolvedValue([{ id: '1', name: 'Team', slug: 'team' }])
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    expect(w.text()).toContain('Team')
  })

  it('shows no-access on 404', async () => {
    vi.spyOn(api, 'getCommunity').mockRejectedValue(new ApiError(404, 'no access'))
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    expect(w.text()).toMatch(/kein Zugriff|nicht gefunden/i)
  })

  it('renders a logout control and clicking it calls logout()', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({
      user: { value: null } as never,
      status: { value: 'authenticated' } as never,
      bootstrap: vi.fn(),
      loginWithGitHub: vi.fn(),
      logout: mockLogout,
      markAnonymous: vi.fn(),
    })
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: false,
      pendingCount: 0,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    vi.spyOn(api, 'listCommunities').mockResolvedValue([{ id: '1', name: 'Team', slug: 'team' }])
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    const logoutBtn = w.find('[data-test="logout"]')
    expect(logoutBtn.exists()).toBe(true)
    await logoutBtn.trigger('click')
    await flushPromises()
    expect(mockLogout).toHaveBeenCalled()
  })

  it('shows the ⚙ admin menu with a pending badge only for admins', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 2,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    expect(w.find('[data-test=admin-menu]').exists()).toBe(true)
    expect(w.text()).toContain('2') // pending badge
  })

  it('hides the ⚙ admin menu for non-admins', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: false,
      pendingCount: 0,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    expect(w.find('[data-test=admin-menu]').exists()).toBe(false)
  })
})
