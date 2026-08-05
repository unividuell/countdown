import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/superAdmin'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))

describe('super-admin community overview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders every community with its roster, admin badge and pending marker', async () => {
    vi.spyOn(api, 'listAllCommunities').mockResolvedValue([
      {
        id: 'c1',
        name: 'Team',
        slug: 'team',
        startsAt: null,
        // UTC+14: the joinedAt below lands on the next day here, but not in UTC.
        startsAtTimezone: 'Pacific/Kiritimati',
        createdAt: '2026-01-01T00:00:00Z',
        members: [
          {
            userId: 'u1',
            username: 'Alice',
            githubLogin: 'alice',
            status: 'ACTIVE',
            isAdmin: true,
            joinedAt: '2026-03-01T20:00:00Z',
          },
          {
            userId: 'u2',
            username: 'Bob',
            githubLogin: 'bob',
            status: 'PENDING',
            isAdmin: false,
            joinedAt: '2026-03-02T00:00:00Z',
          },
        ],
      },
    ])
    const Page = (await import('@/pages/super-admin/communities.vue')).default
    const w = mount(Page)
    await flushPromises()

    const members = w.findAll('[data-test=member]')
    expect(members).toHaveLength(2)
    // Per row, not just page-wide: a badge on the wrong row must fail even though the count stays 1.
    expect(members[0]!.find('[data-test=admin-badge]').exists()).toBe(true)
    expect(members[1]!.find('[data-test=admin-badge]').exists()).toBe(false)
    expect(w.findAll('[data-test=admin-badge]')).toHaveLength(1)
    expect(members[0]!.text()).toContain('Alice')
    expect(members[0]!.text()).toContain('02.03.2026') // formatted in the community's zone
    expect(members[1]!.text()).toContain('ausstehend')
    expect(w.find('a[href="/c/team/settings"]').exists()).toBe(true)
  })

  it('shows a hint for a community without members', async () => {
    vi.spyOn(api, 'listAllCommunities').mockResolvedValue([
      {
        id: 'c2',
        name: 'Leer',
        slug: 'leer',
        startsAt: null,
        startsAtTimezone: 'Europe/Berlin',
        createdAt: '2026-01-01T00:00:00Z',
        members: [],
      },
    ])
    const Page = (await import('@/pages/super-admin/communities.vue')).default
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('Keine Mitglieder')
    expect(w.findAll('[data-test=member]')).toHaveLength(0)
  })

  it('shows a hint when there are no communities at all', async () => {
    vi.spyOn(api, 'listAllCommunities').mockResolvedValue([])
    const Page = (await import('@/pages/super-admin/communities.vue')).default
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('Noch keine Spielgemeinschaften.')
    expect(w.findAll('[data-test=community]')).toHaveLength(0)
  })

  it('shows an error message when the overview cannot be loaded', async () => {
    vi.spyOn(api, 'listAllCommunities').mockRejectedValue(new Error('boom'))
    const Page = (await import('@/pages/super-admin/communities.vue')).default
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('konnten nicht geladen werden')
  })

  it('links back to the super-admin hub', async () => {
    vi.spyOn(api, 'listAllCommunities').mockResolvedValue([])
    const Page = (await import('@/pages/super-admin/communities.vue')).default
    const w = mount(Page)
    await flushPromises()

    expect(w.find('a[href="/super-admin"]').text()).toContain('Super-Admin')
  })
})
