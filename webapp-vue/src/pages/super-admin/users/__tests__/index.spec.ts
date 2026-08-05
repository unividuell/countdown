import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/superAdmin'
import type { SuperAdminUserListEntry } from '@/api/types'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))

const entry = (over: Partial<SuperAdminUserListEntry> = {}): SuperAdminUserListEntry => ({
  userId: 'u1',
  username: 'Alice',
  githubLogin: 'alice',
  isSuperAdmin: false,
  communityCreationAllowed: false,
  createdAt: '2026-01-14T23:30:00Z',
  ...over,
})

describe('super-admin user list', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists users and links each row to its detail view', async () => {
    vi.spyOn(api, 'listUsers').mockResolvedValue([entry()])
    const Page = (await import('@/pages/super-admin/users/index.vue')).default
    const w = mount(Page)
    await flushPromises()

    const rows = w.findAll('[data-test=user-row]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Alice')
    expect(rows[0]!.text()).toContain('alice')
    expect(w.find('a[href="/super-admin/users/u1"]').exists()).toBe(true)
  })

  it('badges only a stored clearance, and never alongside super-admin', async () => {
    vi.spyOn(api, 'listUsers').mockResolvedValue([
      entry({ userId: 'u1', username: 'Plain' }),
      entry({ userId: 'u2', username: 'Cleared', communityCreationAllowed: true }),
      // Both facts set at once — this is the row that proves the badges are exclusive rather
      // than merely that a super-admin without a clearance shows one badge.
      entry({ userId: 'u3', username: 'Boss', isSuperAdmin: true, communityCreationAllowed: true }),
    ])
    const Page = (await import('@/pages/super-admin/users/index.vue')).default
    const w = mount(Page)
    await flushPromises()

    const rows = w.findAll('[data-test=user-row]')
    expect(rows[0]!.find('[data-test=clearance-badge]').exists()).toBe(false)
    expect(rows[0]!.find('[data-test=super-admin-badge]').exists()).toBe(false)
    expect(rows[1]!.find('[data-test=clearance-badge]').exists()).toBe(true)
    expect(rows[2]!.find('[data-test=super-admin-badge]').exists()).toBe(true)
    expect(rows[2]!.find('[data-test=clearance-badge]').exists()).toBe(false)
  })

  it('shows an error message when the list cannot be loaded', async () => {
    vi.spyOn(api, 'listUsers').mockRejectedValue(new Error('boom'))
    const Page = (await import('@/pages/super-admin/users/index.vue')).default
    const w = mount(Page)
    await flushPromises()

    expect(w.text()).toContain('konnten nicht geladen werden')
  })
})
