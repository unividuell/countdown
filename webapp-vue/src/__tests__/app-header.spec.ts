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
  displayName: null,
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
  NavDrawer: { template: '<div data-test="nav-toggle" />', props: ['user'] },
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
      viewerIdentity: null,
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
      viewerIdentity: null,
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
      viewerIdentity: null,
    }
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toContain("'26")
  })

  it('shows no menu for an anonymous visitor', () => {
    expect(mount(App, { global: { stubs } }).find('[data-test=nav-toggle]').exists()).toBe(false)
  })

  it('shows the menu once someone is signed in', () => {
    mockStatus('authenticated')
    expect(mount(App, { global: { stubs } }).find('[data-test=nav-toggle]').exists()).toBe(true)
  })

  it('lifts the header above the drawer that slides in under it', () => {
    // The drawer is z-20 and hangs off the header's bottom edge; without z-30 and a shadow the
    // header would be overrun by it instead of sitting on top with an edge you can see.
    const header = mount(App, { global: { stubs } }).get('header')
    expect(header.classes()).toEqual(expect.arrayContaining(['relative', 'z-30', 'shadow-lg']))
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
      viewerIdentity: null,
    }
    const w = mount(App, { global: { stubs } })
    const row = w.get('[data-test="countdown-row"]')
    expect(row.find('[data-test="countdown-widget"]').exists()).toBe(true)

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

  // From md the row is as tall as the board plus its legend, so centring the title and the avatar in
  // it puts them 9px below the middle of the digits — the avatar reads as having come loose from the
  // band. Both are pinned to the top of the row in a board-tall box instead, which lands their
  // centres on the digits' centre line and leaves the legend hanging below all three. happy-dom
  // computes no box heights, so the classes are the observable part; the alignment itself is a
  // browser measurement.
  it('puts the title and the avatar on the digits centre line from md, not the whole row', () => {
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
      viewerIdentity: null,
    }
    const w = mount(App, { global: { stubs } })
    for (const cell of ['title-row', 'account-cell']) {
      expect(w.get(`[data-test="${cell}"]`).classes()).toContain('md:h-[26px]')
      expect(w.get(`[data-test="${cell}"]`).classes()).toContain('md:self-start')
    }
    expect(w.get('[data-test="countdown-row"]').classes()).toContain('md:self-start')
  })

  // Without a board there is nothing to align to, and the cells must keep their own 40px — otherwise
  // a 26px override would shrink the header below the height it had before this feature existed.
  it('leaves the row-1 cells at their own height where there is no board', () => {
    const w = mount(App, { global: { stubs } })
    for (const cell of ['title-row', 'account-cell']) {
      expect(w.get(`[data-test="${cell}"]`).classes()).toContain('h-10')
      expect(w.get(`[data-test="${cell}"]`).classes()).not.toContain('md:h-[26px]')
    }
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
      viewerIdentity: null,
    }
    const cells = mount(App, { global: { stubs } })
      .get('header')
      .findAll(':scope > div')
      .map((d) => d.attributes('data-test'))
    expect(cells).toEqual(['title-row', 'account-cell', 'countdown-row'])
  })

  // A grid track is as tall as its tallest item, so BOTH cells of row 1 have to state the height.
  // With it on the title cell alone, the login page (no NavDrawer, whose toggle is 40px) would be
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
