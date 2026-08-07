import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import NavDrawer from '@/nav/NavDrawer.vue'
import { activeCommunity } from '@/communities/context'
import { _resetCommunitiesState } from '@/communities/useCommunities'
import { useAuth } from '@/auth/useAuth'
import * as api from '@/api/communities'
import type { MeResponse } from '@/api/types'

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

/**
 * Mounts inside a real <header>, because the drawer reads its top edge from
 * `trigger.closest('header')`. `headerBottom` stubs that edge — happy-dom's own
 * getBoundingClientRect answers 0 for everything.
 *
 * teleport: true renders the drawer in place; teleported to <body> it would sit outside
 * wrapper.element, where wrapper.find() cannot reach it.
 */
function render(user: MeResponse = viewer, headerBottom = 0) {
  const host = document.createElement('header')
  host.getBoundingClientRect = () => ({ bottom: headerBottom }) as DOMRect
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
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-spinner]').attributes('style')).toContain('rotate(0deg)')
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
