import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import App from '@/App.vue'
import { activeCommunity } from '@/communities/context'
import { useAuth } from '@/auth/useAuth'
import { navigationPending } from '@/ui/navigationProgress'

vi.mock('@/auth/useAuth', () => ({ useAuth: vi.fn() }))

function mockStatus(status: 'unknown' | 'authenticated' | 'anonymous') {
  vi.mocked(useAuth).mockReturnValue({
    user: ref(null) as never,
    status: ref(status) as never,
    bootstrap: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout: vi.fn(),
    markAnonymous: vi.fn(),
  })
}

const stubs = {
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  RouterView: { template: '<div />' },
  CountdownDisplay: { template: '<div data-test="countdown-widget" />', props: ['slug'] },
  CommunityMenu: { template: '<div data-test="community-menu" />', props: ['community'] },
  MemberMenu: { template: '<div data-test="member-menu" />' },
}

describe('App main header', () => {
  beforeEach(() => {
    activeCommunity.value = null
    mockStatus('anonymous')
    navigationPending.value = false
  })

  it('shows the app name and no countdown when no community is active', () => {
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toBe('countdown')
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(false)
  })

  it('shows the community title + year suffix and the countdown when active', () => {
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toContain('Hütte Hütte')
    expect(w.find('a[href="/"]').text()).toContain("'26")
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(true)
  })

  it('shows the title without a year suffix and hides the countdown when startsAt is unset', () => {
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toBe('Hütte Hütte')
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(false)
  })

  it('derives the year suffix in the community zone, not UTC (boundary case)', () => {
    // 2025-12-31T23:30Z is already 2026-01-01 00:30 in Europe/Berlin -> edition '26 (not '25)
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: '2025-12-31T23:30:00Z',
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toContain("'26")
  })

  it('shows the community menu only inside a community', () => {
    expect(mount(App, { global: { stubs } }).find('[data-test=community-menu]').exists()).toBe(
      false,
    )
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    expect(mount(App, { global: { stubs } }).find('[data-test=community-menu]').exists()).toBe(true)
  })

  it('shows the member menu only for an authenticated viewer', () => {
    expect(mount(App, { global: { stubs } }).find('[data-test=member-menu]').exists()).toBe(false)
    mockStatus('authenticated')
    expect(mount(App, { global: { stubs } }).find('[data-test=member-menu]').exists()).toBe(true)
  })

  it('shows the navigation progress bar only while a navigation is pending', () => {
    expect(mount(App, { global: { stubs } }).find('[data-test=navigation-progress]').exists()).toBe(
      false,
    )
    navigationPending.value = true
    expect(mount(App, { global: { stubs } }).find('[data-test=navigation-progress]').exists()).toBe(
      true,
    )
  })

  it('renders the bar out of flow so appearing cannot push the content down', () => {
    navigationPending.value = true
    const bar = mount(App, { global: { stubs } }).find('[data-test=navigation-progress]')
    // `absolute` is the whole reason the design can promise no layout shift — a bar that
    // shoves <main> down 4px when it appears is the defect it was added to explain.
    expect(bar.classes()).toContain('absolute')
  })

  it('carries a moving segment that stops for viewers who ask for reduced motion', () => {
    navigationPending.value = true
    const w = mount(App, { global: { stubs } })
    const segment = w.find('[data-test=navigation-progress-segment]')
    expect(segment.exists()).toBe(true)
    expect(segment.classes()).toContain('animate-nav-shuttle')
    expect(segment.classes()).toContain('motion-reduce:animate-none')
  })
})
