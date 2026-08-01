import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { useCommunities } from '@/communities/useCommunities'
import type { ActiveCommunity } from '@/communities/context'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

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
    // `active` (useCommunities.ts) is a module-level singleton, so a previous test's
    // successful load otherwise leaks into this one (Vitest doesn't reset modules
    // between `it`s in the same file) — reset it so each test starts from a clean slate.
    useCommunities().active.value = []
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: '1', name: 'Team Süd', slug: 'team' },
      { id: '2', name: 'Team Nord', slug: 'nord' },
    ])
  })

  it('heads the admin block with the community name and links the three admin pages', async () => {
    const w = await open(admin)
    const menu = w.find('[role=menu]')
    expect(menu.text()).toContain('Team Süd')
    expect(menu.text()).toContain('Anfragen')
    expect(menu.text()).toContain('2') // pending count next to Anfragen
    expect(menu.find('a[href="/team/requests"]').exists()).toBe(true)
    expect(menu.find('a[href="/team/members"]').exists()).toBe(true)
    expect(menu.find('a[href="/team/settings"]').exists()).toBe(true)
  })

  it('shows neither heading nor admin links to a non-admin', async () => {
    const w = await open({ ...admin, viewerIsAdmin: false, pendingCount: 0 })
    const menu = w.find('[role=menu]')
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
    const w = await open(admin)
    expect(w.find('[data-test=create-community]').attributes('href')).toBe('/communities/new')
  })

  it('remembers the selection before navigating to another community', async () => {
    const select = vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const w = await open(admin)
    await w.find('[data-test=switch-community]').trigger('click')
    await flushPromises()
    expect(select).toHaveBeenCalledWith('2')
    expect(pushMock).toHaveBeenCalledWith('/nord/')
  })

  it('navigates even when the selection cannot be persisted', async () => {
    vi.spyOn(api, 'setSelection').mockRejectedValue(new Error('offline'))
    const w = await open(admin)
    await w.find('[data-test=switch-community]').trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith('/nord/')
  })

  it('stays usable when the community list cannot be loaded', async () => {
    vi.spyOn(api, 'listCommunities').mockRejectedValue(new Error('offline'))
    const w = await open(admin)
    expect(w.findAll('[data-test=switch-community]')).toHaveLength(0)
    expect(w.find('[data-test=create-community]').exists()).toBe(true)
  })
})
