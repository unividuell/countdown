import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/superAdmin'
import type { SuperAdminUserDetail } from '@/api/types'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  useRoute: () => ({ params: { id: 'u1' } }),
}))

const detail = (over: Partial<SuperAdminUserDetail> = {}): SuperAdminUserDetail => ({
  userId: 'u1',
  username: 'Alice',
  githubLogin: 'alice',
  githubName: 'Alice A.',
  displayName: null,
  email: 'alice@example.com',
  bgColorHex: null,
  isSuperAdmin: false,
  communityCreationAllowed: false,
  createdAt: '2026-01-14T23:30:00Z',
  updatedAt: null,
  ...over,
})

async function page() {
  const Page = (await import('@/pages/super-admin/users/[id].vue')).default
  const w = mount(Page)
  await flushPromises()
  return w
}

describe('super-admin user detail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the profile facts of the routed user', async () => {
    vi.spyOn(api, 'getUser').mockResolvedValue(detail())
    const w = await page()

    expect(api.getUser).toHaveBeenCalledWith('u1')
    expect(w.text()).toContain('Alice')
    expect(w.text()).toContain('alice@example.com')
    expect(w.text()).toContain('15.01.2026')
  })

  it('grants the clearance and adopts the server response', async () => {
    vi.spyOn(api, 'getUser').mockResolvedValue(detail())
    vi.spyOn(api, 'setCommunityCreation').mockResolvedValue(
      detail({ communityCreationAllowed: true }),
    )
    const w = await page()

    await w.find('[data-test=toggle-clearance]').trigger('click')
    await flushPromises()

    expect(api.setCommunityCreation).toHaveBeenCalledWith('u1', true)
    expect(w.find('[data-test=toggle-clearance]').text()).toContain('entziehen')
  })

  it('revokes the clearance', async () => {
    vi.spyOn(api, 'getUser').mockResolvedValue(detail({ communityCreationAllowed: true }))
    vi.spyOn(api, 'setCommunityCreation').mockResolvedValue(
      detail({ communityCreationAllowed: false }),
    )
    const w = await page()

    await w.find('[data-test=toggle-clearance]').trigger('click')
    await flushPromises()

    expect(api.setCommunityCreation).toHaveBeenCalledWith('u1', false)
  })

  it('keeps the old state and reports the failure when the call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(api, 'getUser').mockResolvedValue(detail())
    vi.spyOn(api, 'setCommunityCreation').mockRejectedValue(new Error('boom'))
    const w = await page()

    await w.find('[data-test=toggle-clearance]').trigger('click')
    await flushPromises()

    expect(w.text()).toContain('Freischaltung konnte nicht geändert werden')
    expect(w.find('[data-test=toggle-clearance]').text()).toContain('Freischalten')
  })

  it('disables the action for a super-admin and says why', async () => {
    vi.spyOn(api, 'getUser').mockResolvedValue(detail({ isSuperAdmin: true }))
    const w = await page()

    expect(w.find('[data-test=toggle-clearance]').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Super-Admins dürfen immer erstellen')
  })

  it('shows an error message when the user cannot be loaded', async () => {
    vi.spyOn(api, 'getUser').mockRejectedValue(new Error('boom'))
    const w = await page()

    expect(w.text()).toContain('konnte nicht geladen werden')
  })
})
