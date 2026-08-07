import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/superAdmin'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))

describe('super-admin landing page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('labels each flag/allowlist combination and links to the community overview', async () => {
    vi.spyOn(api, 'listSuperAdmins').mockResolvedValue([
      {
        githubLogin: 'boss',
        username: 'Boss',
        userId: 'u1',
        flagged: true,
        allowlisted: true,
        // Just before midnight UTC so Berlin (UTC+1 in January) is already on the 15th —
        // proves formatDate uses the zone, not UTC (a round UTC midnight passes either way).
        createdAt: '2026-01-14T23:30:00Z',
      },
      {
        githubLogin: 'ghost',
        username: null,
        userId: null,
        flagged: false,
        allowlisted: true,
        createdAt: null,
      },
      {
        githubLogin: 'removed',
        username: 'Removed',
        userId: 'u3',
        flagged: true,
        allowlisted: false,
        createdAt: '2026-02-01T00:00:00Z',
      },
    ])
    const Page = (await import('@/pages/super-admin/index.vue')).default
    const w = mount(Page)
    await flushPromises()

    const rows = w.findAll('[data-test=super-admin-row]')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.text()).toContain('Aktiv')
    expect(rows[0]!.text()).toContain('15.01.2026')
    expect(rows[1]!.text()).toContain('Wartet auf ersten Login')
    expect(rows[2]!.text()).toContain('Nicht mehr auf der Allowlist')
    expect(w.find('a[href="/super-admin/communities"]').exists()).toBe(true)

    const nav = w.findAll('[data-test=nav-entry]')
    expect(nav).toHaveLength(2)
    expect(nav.map((a) => a.text())).toEqual(['Nutzer', 'Spielgemeinschaften'])
    expect(w.find('a[href="/super-admin/users"]').exists()).toBe(true)
    expect(w.find('a[href="/super-admin/communities"]').exists()).toBe(true)
  })

  it('shows an error message when the roster cannot be loaded', async () => {
    vi.spyOn(api, 'listSuperAdmins').mockRejectedValue(new Error('boom'))
    const Page = (await import('@/pages/super-admin/index.vue')).default
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('konnten nicht geladen werden')
  })

  it('keeps the nav list usable when the roster fails to load', async () => {
    vi.spyOn(api, 'listSuperAdmins').mockRejectedValue(new Error('boom'))
    const Page = (await import('@/pages/super-admin/index.vue')).default
    const w = mount(Page)
    await flushPromises()

    expect(w.findAll('[data-test=nav-entry]')).toHaveLength(2)
    expect(w.text()).toContain('konnten nicht geladen werden')
  })
})
