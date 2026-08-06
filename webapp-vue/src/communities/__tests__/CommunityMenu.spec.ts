import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { _resetCommunitiesState } from '@/communities/useCommunities'
import type { ActiveCommunity } from '@/communities/context'
import * as client from '@/api/client'
import { useAuth, _resetAuthState } from '@/auth/useAuth'

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

/** Mounts without opening: the trigger is absent when the menu would have no entries. */
async function render(community: ActiveCommunity) {
  const Cmp = (await import('@/communities/CommunityMenu.vue')).default
  const w = mount(Cmp, { props: { community } })
  await flushPromises()
  return w
}

// Real vue-router's push() always returns a Promise; CommunityMenu.vue attaches a .catch()
// to it, so the double must resolve like the real thing rather than return undefined.
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn().mockResolvedValue(undefined) }))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  return {
    useRoute: () => reactive({ fullPath: '/team/' }),
    useRouter: () => ({ push: pushMock, replace: vi.fn() }),
    RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  }
})

const admin: ActiveCommunity = {
  slug: 'team',
  name: 'Team Süd',
  startsAt: null,
  startsAtTimezone: 'Europe/Berlin',
  viewerIsAdmin: true,
  pendingCount: 2,
}

async function open(community: ActiveCommunity) {
  const Cmp = (await import('@/communities/CommunityMenu.vue')).default
  const w = mount(Cmp, { props: { community } })
  await flushPromises()
  await w.find('button').trigger('click')
  return w
}

describe('CommunityMenu', () => {
  beforeEach(() => {
    pushMock.mockClear()
    apiFetch.mockReset()
    _resetAuthState()
    // `active` (useCommunities.ts) is a module-level singleton, so a previous test's
    // successful load otherwise leaks into this one (Vitest doesn't reset modules
    // between `it`s in the same file) — reset it so each test starts from a clean slate.
    _resetCommunitiesState()
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: '1', name: 'Team Süd', slug: 'team' },
      { id: '2', name: 'Team Nord', slug: 'nord' },
    ])
  })

  it('heads the admin block with the community name and links the three admin pages', async () => {
    const w = await open(admin)
    const menu = w.find('[data-test=menu-panel]')
    expect(menu.text()).toContain('Team Süd')
    expect(menu.text()).toContain('Anfragen')
    expect(menu.text()).toContain('2') // pending count next to Anfragen
    expect(menu.find('a[href="/c/team/requests"]').exists()).toBe(true)
    expect(menu.find('a[href="/c/team/members"]').exists()).toBe(true)
    expect(menu.find('a[href="/c/team/settings"]').exists()).toBe(true)
  })

  it('shows neither heading nor admin links to a non-admin', async () => {
    const w = await open({ ...admin, viewerIsAdmin: false, pendingCount: 0 })
    const menu = w.find('[data-test=menu-panel]')
    expect(menu.text()).not.toContain('Anfragen')
    expect(menu.text()).not.toContain('Einstellungen')
    expect(menu.text()).not.toContain('Team Süd')
  })

  it('shows the pending dot only for an admin with open requests', async () => {
    expect((await open(admin)).find('[data-test=pending-dot]').exists()).toBe(true)
    expect(
      (await open({ ...admin, pendingCount: 0 })).find('[data-test=pending-dot]').exists(),
    ).toBe(false)
    expect(
      (await open({ ...admin, viewerIsAdmin: false })).find('[data-test=pending-dot]').exists(),
    ).toBe(false)
  })

  it('carries the pending signal in the trigger label, since the dot is aria-hidden', async () => {
    expect((await open(admin)).find('[data-test=pending-dot]').attributes('aria-hidden')).toBe(
      'true',
    )
    expect((await open(admin)).find('button').attributes('aria-label')).toBe(
      'Community-Menü, offene Anfragen',
    )
    expect(
      (await open({ ...admin, pendingCount: 0 })).find('button').attributes('aria-label'),
    ).toBe('Community-Menü')
  })

  it('lists the other communities but not the current one', async () => {
    const w = await open(admin)
    const entries = w.findAll('[data-test=switch-community]')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.text()).toBe('Team Nord')
  })

  it('offers the create action', async () => {
    await signIn(true)
    const w = await open(admin)
    expect(w.find('[data-test=create-community]').attributes('href')).toBe('/communities/new')
  })

  it('navigates to the other community without waiting on a round-trip', async () => {
    // The selection is persisted by the router guard after the navigation commits;
    // awaiting it here would delay every switch by a request.
    const select = vi.spyOn(api, 'setSelection')
    const w = await open(admin)
    await w.find('[data-test=switch-community]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/c/nord/')
    expect(select).not.toHaveBeenCalled()
  })

  it('stays usable when the community list cannot be loaded', async () => {
    await signIn(true)
    vi.spyOn(api, 'listCommunities').mockRejectedValue(new Error('offline'))
    const w = await open(admin)
    expect(w.findAll('[data-test=switch-community]')).toHaveLength(0)
    expect(w.find('[data-test=create-community]').exists()).toBe(true)
  })

  it('hides creating a community from an uncleared viewer', async () => {
    await signIn(false)
    const w = await open(admin)

    expect(w.find('[data-test=create-community]').exists()).toBe(false)
    // Another community still follows the admin block, so the divider separates something.
    expect(w.find('[data-test=admin-divider]').exists()).toBe(true)
  })

  it('drops the admin divider when nothing follows it', async () => {
    // An admin of their only community, without the clearance — the state every current
    // non-super-admin owner is in, since nobody was grandfathered. The divider closes the admin
    // block, so with neither a switch entry nor the create link it would be a floating rule.
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: '1', name: 'Team Süd', slug: 'team' },
    ])
    await signIn(false)
    const w = await open(admin)

    expect(w.find('[data-test=switch-community]').exists()).toBe(false)
    expect(w.find('[data-test=create-community]').exists()).toBe(false)
    expect(w.find('[data-test=admin-divider]').exists()).toBe(false)
  })

  it('keeps the admin divider when only the create link follows it', async () => {
    // Pins the other half of the gate: with `others` empty, the clearance alone must keep it.
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: '1', name: 'Team Süd', slug: 'team' },
    ])
    await signIn(true)
    const w = await open(admin)

    expect(w.find('[data-test=create-community]').exists()).toBe(true)
    expect(w.find('[data-test=admin-divider]').exists()).toBe(true)
  })

  it('renders no menu at all when nothing would be left in it', async () => {
    // A non-admin in exactly one community without the clearance. The create link used to be the
    // one guaranteed entry, so without the guard this trigger would open an empty panel.
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: '1', name: 'Team Süd', slug: 'team' },
    ])
    await signIn(false)
    const w = await render({ ...admin, viewerIsAdmin: false, pendingCount: 0 })

    expect(w.find('[data-test=community-menu]').exists()).toBe(false)
  })

  it('still renders the menu for a non-admin who can switch communities', async () => {
    // Same viewer, but a second community remains as an entry — the trigger must stay.
    await signIn(false)
    const w = await render({ ...admin, viewerIsAdmin: false, pendingCount: 0 })

    expect(w.find('[data-test=community-menu]').exists()).toBe(true)
  })
})
