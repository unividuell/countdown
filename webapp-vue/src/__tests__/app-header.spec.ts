import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import App from '@/App.vue'
import { activeCommunity } from '@/communities/context'
import { useAuth } from '@/auth/useAuth'
import { navigationPending } from '@/ui/navigationProgress'
import type { MeResponse } from '@/api/types'

vi.mock('@/auth/useAuth', () => ({ useAuth: vi.fn() }))

const viewer: MeResponse = {
  id: 'u1',
  username: 'octo',
  githubLogin: 'octo',
  githubName: null,
  email: null,
  bgColorHex: null,
  avatar: { shortName: 'OCTO', bgColorHex: '#8e44ad' },
  isSuperAdmin: false,
  mayCreateCommunities: false,
  createdAt: null,
}

function mockStatus(status: 'authenticated' | 'anonymous') {
  vi.mocked(useAuth).mockReturnValue({
    user: ref(status === 'authenticated' ? viewer : null) as never,
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
  MemberMenu: { template: '<div data-test="member-menu" />', props: ['user'] },
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

  it('clips horizontally at the unpadded root, not at <main>, so the member row fly-in cannot open a page scrollbar', () => {
    const w = mount(App, { global: { stubs } })
    expect(w.classes()).toContain('overflow-x-clip')
  })

  // No countdown, no second row: the header goes back to the height it had before the board existed
  // rather than carrying 52px of reserved black on the login page and the community list.
  it('drops the countdown row entirely where no community is active', () => {
    const w = mount(App, { global: { stubs } })
    expect(w.find('[data-test="countdown-row"]').exists()).toBe(false)
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(false)
  })

  // Narrow, the board needs a row of its own. From md there is room beside the title, and it moves
  // up next to the account menu so the row's slack sits between the title and the two of them —
  // otherwise a desktop header is mostly empty black. One instance either way; only its placement
  // changes.
  it('moves the countdown up beside the account menu from md, and keeps it below the title before', () => {
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    const w = mount(App, { global: { stubs } })
    const row = w.get('[data-test="countdown-row"]')
    expect(row.get('[data-test="countdown-widget"]').exists()).toBe(true)

    // Narrow: its own row, spanning both columns.
    expect(row.classes()).toContain('row-start-2')
    expect(row.classes()).toContain('col-span-2')
    // From md: row 1, middle column, with the account menu pushed to the third.
    expect(row.classes()).toContain('md:row-start-1')
    expect(row.classes()).toContain('md:col-start-2')
    expect(row.classes()).toContain('md:col-span-1')
    expect(w.get('[data-test="account-cell"]').classes()).toContain('md:col-start-3')
    // The third track only exists from md, which is what leaves the slack on the title's side.
    expect(w.get('header').classes()).toContain('md:grid-cols-[1fr_auto_auto]')
  })

  // The board sits between title and account in the visual order from md, but after both in the DOM,
  // because the narrow layout — which phones get — reads title, account, then the board below.
  it('keeps the DOM order of the narrow layout, which is the common one', () => {
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    const cells = mount(App, { global: { stubs } })
      .get('header')
      .findAll(':scope > div')
      .map((d) => d.attributes('data-test'))
    expect(cells).toEqual(['title-row', 'account-cell', 'countdown-row'])
  })

  // A grid track is as tall as its tallest item, so BOTH cells of row 1 have to state the height.
  // With it on the title cell alone, the login page (no MemberMenu, whose trigger is 40px) would be
  // 108px while every other page was 116px — the very variance the fixed height exists to remove.
  // happy-dom computes no box heights, so the classes are all a test can see here; the measurement
  // itself belongs to the browser step.
  it('states row 1 height on both of its cells, so it cannot depend on being signed in', () => {
    const anonymous = mount(App, { global: { stubs } })
    expect(anonymous.get('[data-test="title-row"]').classes()).toContain('h-10')
    expect(anonymous.get('[data-test="account-cell"]').classes()).toContain('h-10')
    mockStatus('authenticated')
    const signedIn = mount(App, { global: { stubs } })
    expect(signedIn.get('[data-test="title-row"]').classes()).toContain('h-10')
    expect(signedIn.get('[data-test="account-cell"]').classes()).toContain('h-10')
  })
})
