import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import NavDrawer from '@/nav/NavDrawer.vue'
import { activeCommunity } from '@/communities/context'
import { _resetCommunitiesState } from '@/communities/useCommunities'
import { useAuth } from '@/auth/useAuth'
import * as api from '@/api/communities'
import { communityPath } from '@/communities/routes'
import { requestDrawerClose } from '@/nav/drawerControl'
import type { CommunitySummary, MeResponse } from '@/api/types'

enableAutoUnmount(afterEach)

vi.mock('@/api/communities', () => ({ listCommunities: vi.fn(), getSelection: vi.fn() }))
vi.mock('@/auth/useAuth', () => ({ useAuth: vi.fn() }))

// push/replace must resolve: NavDrawer attaches .catch() to every navigation, and .catch on a
// bare vi.fn()'s undefined return throws synchronously.
//
// `route` is built as the reactive() proxy itself, not a plain object wrapped later: Vue's
// reactive() traps only fire through the proxy, so if the test mutated a raw object that the
// mock wrapped independently, `route.fullPath = ...` here would never reach the component's
// watcher — the value would change, but nothing would be notified.
const { pushMock, replaceMock, route, logoutMock } = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return {
    pushMock: vi.fn().mockResolvedValue(undefined),
    replaceMock: vi.fn().mockResolvedValue(undefined),
    logoutMock: vi.fn().mockResolvedValue(undefined),
    route: reactive({ fullPath: '/' }),
  }
})
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))

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

// Backs the host <header>'s stubbed getBoundingClientRect (see render() below). Reassigned on
// every render() so each test starts from its own value; setHeaderBottom() then lets a test
// change it after mount, to drive a re-measure.
let headerBottom = ref(0)

function setHeaderBottom(value: number): void {
  headerBottom.value = value
}

/**
 * Mounts inside a real <header>, because the drawer reads its top edge from
 * `trigger.closest('header')`. `headerBottom` (the parameter) seeds the stubbed edge —
 * happy-dom's own getBoundingClientRect answers 0 for everything.
 *
 * The stub reads the module-level `headerBottom` ref rather than closing over the parameter
 * value directly, so a test can change the header's reported bottom edge after mount via
 * setHeaderBottom() without remounting.
 *
 * teleport: true renders the drawer in place; teleported to <body> it would sit outside
 * wrapper.element, where wrapper.find() cannot reach it.
 */
function render(user: MeResponse = viewer, initialHeaderBottom = 0) {
  headerBottom = ref(initialHeaderBottom)
  const host = document.createElement('header')
  host.getBoundingClientRect = () => ({ bottom: headerBottom.value }) as DOMRect
  document.body.appendChild(host)
  return mount(NavDrawer, {
    props: { user },
    attachTo: host,
    global: { stubs: { teleport: true } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({
    user: ref(viewer) as never,
    status: ref('authenticated') as never,
    bootstrap: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout: logoutMock,
    markAnonymous: vi.fn(),
  })
  vi.mocked(api.listCommunities).mockResolvedValue([])
  _resetCommunitiesState()
  activeCommunity.value = null
  route.fullPath = '/'
  window.innerWidth = 375
})

describe('NavDrawer mechanics', () => {
  it('starts closed: the drawer is inert and hidden from assistive tech', () => {
    const w = render()
    const drawer = w.get('[data-test=nav-drawer]')
    expect(drawer.attributes('inert')).toBeDefined()
    expect(drawer.attributes('aria-hidden')).toBe('true')
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('false')
  })

  it('opens on the toggle and drops inert', async () => {
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('true')
    const drawer = w.get('[data-test=nav-drawer]')
    expect(drawer.attributes('inert')).toBeUndefined()
    expect(drawer.attributes('aria-hidden')).toBeUndefined()
  })

  it('closes an open drawer when a page requests it', async () => {
    // Catches a missing or disconnected drawer-close command channel: a page action must be
    // able to close the real, currently-open global drawer without knowing its internals.
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')

    requestDrawerClose()
    await nextTick()

    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('false')
  })

  it('shows a scroll cue only until the logo container comes into view', async () => {
    // Catches a missing or stale overflow affordance: the visual cue must disappear as soon as
    // the logo container enters the viewport, where content ends.
    const w = render()
    const scroll = w.get('[data-test=nav-scroll]').element
    const mark = w.get('[data-test=nav-mark]').element
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 0, writable: true },
    })
    Object.defineProperty(mark, 'offsetTop', { configurable: true, value: 150 })

    scroll.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(w.find('[data-test=nav-scroll-cue]').exists()).toBe(true)

    scroll.scrollTop = 55
    scroll.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(w.find('[data-test=nav-scroll-cue]').exists()).toBe(false)
  })

  it('names the toggle for its current action', async () => {
    const w = render()
    const toggle = w.get('[data-test=nav-toggle]')
    // The label sits on the button, not on the avatar inside it: name-from-content does not
    // pull a child's aria-label up into a button's accessible name in Chromium.
    expect(toggle.attributes('aria-label')).toBe('Menü öffnen')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-label')).toBe('Menü schließen')
  })

  it('mentions open requests in the toggle name while the dot shows', async () => {
    activeCommunity.value = {
      slug: 'team',
      name: 'Team',
      startsAt: null,
      startsAtTimezone: 'UTC',
      viewerIsAdmin: true,
      pendingCount: 2,
    }
    const w = render()
    await nextTick()
    expect(w.find('[data-test=pending-dot]').exists()).toBe(true)
    expect(w.get('[data-test=nav-toggle]').attributes('aria-label')).toBe(
      'Menü öffnen, offene Anfragen',
    )
  })

  it('shows no dot for a non-admin, however many requests are pending', async () => {
    activeCommunity.value = {
      slug: 'team',
      name: 'Team',
      startsAt: null,
      startsAtTimezone: 'UTC',
      viewerIsAdmin: false,
      pendingCount: 7,
    }
    const w = render()
    await nextTick()
    expect(w.find('[data-test=pending-dot]').exists()).toBe(false)
  })

  it('spins the avatar by the drawer travel, and unwinds it exactly on close', async () => {
    window.innerWidth = 375 // min(320, 0.85 * 375 = 318.75 -> 319)
    const w = render()
    const spinner = w.get('[data-test=nav-spinner]')
    expect(spinner.attributes('style')).toContain('rotate(0deg)')
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(spinner.attributes('style')).toContain('rotate(1142.33')
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(spinner.attributes('style')).toContain('rotate(0deg)')
  })

  it('caps the drawer at 320px on a wide viewport', async () => {
    window.innerWidth = 1440
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-drawer]').attributes('style')).toContain('width: 320px')
  })

  it('keeps the avatar still under prefers-reduced-motion', async () => {
    // Restored explicitly (not left to a global restoreMocks) because vi.clearAllMocks() in
    // beforeEach only clears call history, not the mocked implementation — without this the
    // stub would leak into every later test in the file and usePreferredReducedMotion would
    // keep reporting 'reduce' regardless of what any later test needs.
    const spy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-spinner]').attributes('style')).toContain('rotate(0deg)')
    spy.mockRestore()
  })

  it('drives travel and spin off one duration and one curve', async () => {
    // Congruence cannot be measured here — happy-dom computes no styles. What a unit test can
    // pin is that both carry the same transition, which is what makes them congruent.
    const w = render()
    const drawer = w.get('[data-test=nav-drawer]').attributes('class') ?? ''
    const spinner = w.get('[data-test=nav-spinner]').attributes('class') ?? ''
    for (const cls of ['duration-300', 'ease-[cubic-bezier(.4,0,.2,1)]']) {
      expect(drawer).toContain(cls)
      expect(spinner).toContain(cls)
    }
  })

  it('hangs the drawer off the header bottom edge', async () => {
    const w = render(viewer, 116)
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-drawer]').attributes('style')).toContain('top: 116px')
  })

  it('takes the full height once the header has scrolled away', async () => {
    // A scrolled-past header has a negative bottom edge. Clamped to 0 the drawer covers
    // everything — right, because there is no header left to stay below.
    const w = render(viewer, -40)
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-drawer]').attributes('style')).toContain('top: 0px')
  })

  it('re-measures the drawer top when the viewport changes while open', async () => {
    // Regression for drawerTop going stale on resize/orientation change: drawerWidth and spin
    // already track useWindowSize()'s viewport, but drawerTop only used to be set at open time.
    const w = render(viewer, 116)
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-drawer]').attributes('style')).toContain('top: 116px')

    // A community header collapsing from two rows (116px) to one (68px) as the viewport
    // crosses the `md` breakpoint on rotation.
    setHeaderBottom(68)
    window.innerWidth = 812
    window.dispatchEvent(new Event('resize'))
    await nextTick()

    expect(w.get('[data-test=nav-drawer]').attributes('style')).toContain('top: 68px')
  })

  it('does not re-measure the drawer top while closed', async () => {
    // drawerTop starts at its initial 0 and is never touched by setOpen(true) here, since the
    // drawer is never opened. A resize while closed must leave it exactly as it was — the
    // watcher stays gated on `open`.
    const w = render(viewer, 116)
    setHeaderBottom(68)
    window.innerWidth = 812
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(w.get('[data-test=nav-drawer]').attributes('style')).toContain('top: 0px')
  })

  it('keeps the scrim out of the way while closed', async () => {
    // pointer-events-none matters as much as the opacity: a fully transparent scrim that still
    // takes clicks would swallow every click on the page without anything to see.
    const w = render()
    expect(w.get('[data-test=nav-scrim]').classes()).toEqual(
      expect.arrayContaining(['opacity-0', 'pointer-events-none']),
    )
    await w.get('[data-test=nav-toggle]').trigger('click')
    const scrim = w.get('[data-test=nav-scrim]')
    expect(scrim.classes()).toContain('opacity-100')
    expect(scrim.classes()).not.toContain('pointer-events-none')
  })

  it('locks the page behind it while open', async () => {
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(document.body.style.overflow).toBe('hidden')
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('closes on Escape and gives the focus back to the toggle', async () => {
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(w.get('[data-test=nav-toggle]').element)
  })

  it('closes on a click outside, but not on one inside', async () => {
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')

    await w.get('[data-test=nav-drawer]').trigger('click')
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('true')

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('false')
  })

  it('closes on navigation', async () => {
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    route.fullPath = '/c/team/'
    await nextTick()
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('false')
  })

  it('is a dialog while open', async () => {
    const w = render()
    const drawer = w.get('[data-test=nav-drawer]')
    expect(drawer.attributes('role')).toBe('dialog')
    expect(drawer.attributes('aria-modal')).toBe('true')
    expect(drawer.attributes('aria-label')).toBe('Menü')
  })

  it('carries a 32px avatar, which is what the spin angle assumes', () => {
    // AVATAR_PX is a constant in NavDrawer; this is the assertion that ties it to Avatar's
    // actual `sm` size, so shrinking the avatar cannot silently falsify the rotation.
    expect(render().get('[data-test=nav-toggle]').html()).toContain('size-8')
  })

  it('loads the community list once on mount and again on every open', async () => {
    const w = render()
    await flushPromises()
    expect(api.listCommunities).toHaveBeenCalledTimes(1)
    await w.get('[data-test=nav-toggle]').trigger('click')
    await flushPromises()
    expect(api.listCommunities).toHaveBeenCalledTimes(2)
  })

  it('survives a failing community list', async () => {
    vi.mocked(api.listCommunities).mockRejectedValue(new Error('nope'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = render()
    await flushPromises()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('true')
    spy.mockRestore()
  })
})

const community = (id: string, name: string, slug: string): CommunitySummary => ({ id, name, slug })

const THREE = [
  community('2', 'Berghütte', 'berg'),
  community('1', 'Almhütte', 'alm'),
  community('3', 'Chalet', 'chalet'),
]

function asAdminOf(slug: string, name: string, pendingCount = 0) {
  activeCommunity.value = {
    slug,
    name,
    startsAt: null,
    startsAtTimezone: 'UTC',
    viewerIsAdmin: true,
    pendingCount,
  }
}

async function opened(user: MeResponse = viewer) {
  const w = render(user)
  await flushPromises()
  await w.get('[data-test=nav-toggle]').trigger('click')
  await flushPromises()
  return w
}

describe('NavDrawer content', () => {
  it('lists every community alphabetically, the current one greyed and not clickable', async () => {
    vi.mocked(api.listCommunities).mockResolvedValue(THREE)
    activeCommunity.value = {
      slug: 'berg',
      name: 'Berghütte',
      startsAt: null,
      startsAtTimezone: 'UTC',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    const w = await opened()

    const rows = w.findAll('[data-test=switch-community], [data-test=current-community]')
    expect(rows.map((r) => r.text().replace(/\s+/g, ' ').trim())).toEqual([
      'Almhütte',
      'Berghütte',
      'Chalet',
    ])

    const current = w.get('[data-test=current-community]')
    expect(current.element.tagName).toBe('DIV')
    expect(current.attributes('aria-current')).toBe('true')
    expect(current.classes()).toContain('text-neutral-400')
  })

  it('navigates to a community that is not the current one', async () => {
    vi.mocked(api.listCommunities).mockResolvedValue(THREE)
    const w = await opened()
    await w.findAll('[data-test=switch-community]')[0]!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith(communityPath('alm'))
  })

  it('drops the switcher when the viewer is in exactly one community', async () => {
    vi.mocked(api.listCommunities).mockResolvedValue([community('1', 'Almhütte', 'alm')])
    const w = await opened()
    expect(w.find('[data-test=switch-community]').exists()).toBe(false)
    expect(w.find('[data-test=current-community]').exists()).toBe(false)
  })

  it('offers creating a community only to someone allowed to', async () => {
    vi.mocked(api.listCommunities).mockResolvedValue([community('1', 'Almhütte', 'alm')])
    expect((await opened()).find('[data-test=create-community]').exists()).toBe(false)
    expect(
      (await opened({ ...viewer, mayCreateCommunities: true }))
        .get('[data-test=create-community]')
        .attributes('href'),
    ).toBe('/communities/new')
  })

  it('shows the admin block under the community name, with the pending count', async () => {
    asAdminOf('team', 'Team Süd', 3)
    const w = await opened()
    expect(w.get('[data-test=admin-heading]').text()).toBe('Team Süd')
    expect(w.get('[data-test=pending-count]').text()).toBe('3')
    expect(w.findAll('[data-test=nav-scroll] a').map((a) => a.attributes('href'))).toEqual([
      communityPath('team', 'requests'),
      communityPath('team', 'members'),
      communityPath('team', 'settings'),
    ])
  })

  it('hides the count when nothing is pending, but keeps the entry', async () => {
    asAdminOf('team', 'Team Süd', 0)
    const w = await opened()
    expect(w.find('[data-test=pending-count]').exists()).toBe(false)
    expect(w.get('[data-test=admin-heading]').exists()).toBe(true)
  })

  it('separates the admin block from the community block above it, when there is one', async () => {
    vi.mocked(api.listCommunities).mockResolvedValue(THREE)
    asAdminOf('berg', 'Berghütte', 1)
    const w = await opened()
    expect(w.findAll('[data-test=admin-divider]')).toHaveLength(1)
  })

  it('drops the divider above the admin block when it is the first thing in the drawer', async () => {
    // Admin of their only community, and not allowed to create another: the community block
    // (switcher + create-entry) is absent, so the divider would otherwise sit flush against
    // the header seam as a stray rule rather than separating two blocks.
    vi.mocked(api.listCommunities).mockResolvedValue([community('1', 'Team Süd', 'team')])
    asAdminOf('team', 'Team Süd', 0)
    const w = await opened()
    expect(w.findAll('[data-test=admin-divider]')).toHaveLength(0)
  })

  it('shows no admin block to a plain member', async () => {
    activeCommunity.value = {
      slug: 'team',
      name: 'Team Süd',
      startsAt: null,
      startsAtTimezone: 'UTC',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    expect((await opened()).find('[data-test=admin-heading]').exists()).toBe(false)
  })

  it('keeps the super-admin entry out of sight for everyone else', async () => {
    expect((await opened()).find('[data-test=super-admin]').exists()).toBe(false)
    expect(
      (await opened({ ...viewer, isSuperAdmin: true }))
        .get('[data-test=super-admin]')
        .attributes('href'),
    ).toBe('/super-admin')
  })

  it('always shows the mark and the logout entry', async () => {
    const w = await opened()
    expect(w.find('[data-test=nav-mark]').exists()).toBe(true)
    expect(w.get('[data-test=nav-foot]').text()).toContain('Abmelden')
  })

  it('keeps the foot outside the scrolling area so it cannot scroll away', async () => {
    const w = await opened()
    const scroll = w.get('[data-test=nav-scroll]')
    expect(scroll.classes()).toEqual(
      expect.arrayContaining(['flex-1', 'min-h-0', 'overflow-y-auto']),
    )
    expect(scroll.find('[data-test=nav-foot]').exists()).toBe(false)
    // grow + shrink-0: takes the slack, but never gives its own height back.
    expect(w.get('[data-test=nav-mark]').classes()).toEqual(
      expect.arrayContaining(['grow', 'shrink-0', 'basis-auto']),
    )
  })

  it('pins every row touch target so a short viewport cannot shrink it away', async () => {
    // nav-scroll is `flex flex-col`, and flex items shrink by default — a fixed height on a
    // flex item is a request, not a guarantee. Measured on a real 812x375 landscape phone with
    // the drawer open on a community page as an admin: the scroll area already overflowed
    // (clientHeight 212, scrollHeight 433) yet every h-11 row was still squashed to 20px by the
    // shrink algorithm before the container was allowed to overflow, while nav-mark (which
    // already carries shrink-0) kept its full 248px. happy-dom computes no layout, so this test
    // cannot reproduce the collapse — it pins the class contract that prevents it instead, so a
    // row added later without shrink-0 fails here rather than on somebody's phone.
    vi.mocked(api.listCommunities).mockResolvedValue(THREE)
    asAdminOf('berg', 'Berghütte', 1)
    const w = await opened()
    const rows = w.findAll('[data-test=nav-drawer] .h-11')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.classes()).toContain('shrink-0')
    }
  })

  it('signs out and goes to the login page', async () => {
    const w = await opened()
    await w.get('[data-test=logout]').trigger('click')
    await flushPromises()
    expect(logoutMock).toHaveBeenCalled()
    expect(replaceMock).toHaveBeenCalledWith('/login')
  })

  it('stays open with a message when signing out fails', async () => {
    logoutMock.mockRejectedValueOnce(new Error('offline'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = await opened()
    await w.get('[data-test=logout]').trigger('click')
    await flushPromises()
    expect(replaceMock).not.toHaveBeenCalled()
    expect(w.get('[data-test=logout-error]').text()).toContain('fehlgeschlagen')
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('true')
    spy.mockRestore()
  })

  it('clears a stale logout-failure message on close and reopen', async () => {
    logoutMock.mockRejectedValueOnce(new Error('offline'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = await opened()
    await w.get('[data-test=logout]').trigger('click')
    await flushPromises()
    expect(w.get('[data-test=logout-error]').text()).toContain('fehlgeschlagen')

    await w.get('[data-test=nav-toggle]').trigger('click') // close
    await w.get('[data-test=nav-toggle]').trigger('click') // reopen
    await flushPromises()

    expect(w.find('[data-test=logout-error]').exists()).toBe(false)
    spy.mockRestore()
  })

  it('cycles Tab focus between the toggle and the drawer content, wrapping both ways', async () => {
    // Written after the drawer has real content (the logout button in the foot) so the cycle
    // has more than a hypothetical element to move focus to and from.
    const w = await opened()
    const toggle = w.get('[data-test=nav-toggle]').element as HTMLElement
    const focusables = Array.from(
      w
        .get('[data-test=nav-drawer]')
        .element.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    )
    const last = focusables[focusables.length - 1]!

    last.focus()
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(forward)
    expect(forward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(toggle)

    toggle.focus()
    const backward = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(backward)
    expect(backward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
  })
})
