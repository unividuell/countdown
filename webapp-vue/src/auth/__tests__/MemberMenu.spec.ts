import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useAuth } from '@/auth/useAuth'

// Real vue-router's replace() always returns a Promise; MemberMenu.vue attaches a .catch()
// to it, so the double must resolve like the real thing rather than return undefined.
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn().mockResolvedValue(undefined) }))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  return {
    useRoute: () => reactive({ fullPath: '/c/team/' }),
    useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
    RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  }
})
vi.mock('@/auth/useAuth', () => ({ useAuth: vi.fn() }))

function mockAuth(logout: () => Promise<void>, isSuperAdmin = false) {
  vi.mocked(useAuth).mockReturnValue({
    // A real ref: the template reads `user?.isSuperAdmin`, which relies on unwrapping.
    user: ref({ username: 'clemens', isSuperAdmin }) as never,
    status: ref('authenticated') as never,
    bootstrap: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout,
    markAnonymous: vi.fn(),
  })
}

async function open() {
  const Cmp = (await import('@/auth/MemberMenu.vue')).default
  const w = mount(Cmp)
  await w.find('button').trigger('click')
  return w
}

describe('MemberMenu', () => {
  beforeEach(() => replaceMock.mockClear())

  it('shows the username without linking anywhere', async () => {
    mockAuth(vi.fn().mockResolvedValue(undefined))
    const w = await open()
    expect(w.find('[data-test=current-user]').text()).toBe('clemens')
    expect(w.find('[data-test=current-user]').element.tagName.toLowerCase()).not.toBe('a')
  })

  it('logs out and sends the viewer to the login page', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    mockAuth(logout)
    const w = await open()
    await w.find('[data-test=logout]').trigger('click')
    await flushPromises()
    expect(logout).toHaveBeenCalled()
    expect(replaceMock).toHaveBeenCalledWith('/login')
  })

  it('offers the super-admin area to a super-admin, above the logout entry', async () => {
    mockAuth(vi.fn().mockResolvedValue(undefined), true)
    const w = await open()
    const link = w.find('[data-test=super-admin]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/super-admin')
    // Order matters: the entry belongs above "Abmelden", not after it.
    const panel = w.find('[data-test=menu-panel]').html()
    expect(panel.indexOf('data-test="super-admin"')).toBeLessThan(
      panel.indexOf('data-test="logout"'),
    )
  })

  it('hides the super-admin area from everyone else', async () => {
    mockAuth(vi.fn().mockResolvedValue(undefined))
    const w = await open()
    expect(w.find('[data-test=super-admin]').exists()).toBe(false)
  })

  it('surfaces a failed logout instead of navigating away', async () => {
    mockAuth(vi.fn().mockRejectedValue(new Error('server down')))
    const w = await open()
    await w.find('[data-test=logout]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test=logout-error]').text()).toContain('Abmelden fehlgeschlagen')
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
