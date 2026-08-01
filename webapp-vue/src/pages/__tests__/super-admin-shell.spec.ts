import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useAuth } from '@/auth/useAuth'

vi.mock('vue-router', () => ({
  RouterView: { template: '<div>child-route</div>' },
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))
vi.mock('@/auth/useAuth', () => ({ useAuth: vi.fn() }))

// A real ref, not { value: … }: the shell's template relies on Vue unwrapping it.
function mockUser(isSuperAdmin: boolean): void {
  vi.mocked(useAuth).mockReturnValue({
    user: ref({ username: 'Boss', isSuperAdmin }) as never,
    status: ref('authenticated') as never,
    bootstrap: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout: vi.fn(),
    markAnonymous: vi.fn(),
  })
}

describe('super-admin shell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('denies a non-super-admin and never renders the child route', async () => {
    mockUser(false)
    const Shell = (await import('@/pages/super-admin.vue')).default
    const w = mount(Shell)
    expect(w.text()).toContain('Kein Zugriff')
    expect(w.text()).not.toContain('child-route')
  })

  it('renders the child route for a super-admin', async () => {
    mockUser(true)
    const Shell = (await import('@/pages/super-admin.vue')).default
    const w = mount(Shell)
    expect(w.text()).toContain('child-route')
    expect(w.text()).not.toContain('Kein Zugriff')
  })
})
