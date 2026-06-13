import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as comp from '@/communities/useCommunities'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: push }) }))

describe('index redirect resolver', () => {
  beforeEach(() => {
    push.mockReset()
    sessionStorage.clear()
  })

  it('returns to the stashed post-login destination instead of the default landing', async () => {
    sessionStorage.setItem('postLoginRedirect', '/join/tok123')
    const landing = vi.fn()
    vi.spyOn(comp, 'useCommunities').mockReturnValue({
      active: { value: [] } as never,
      refresh: vi.fn(),
      landing,
    })
    const Index = (await import('@/pages/index.vue')).default
    mount(Index)
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/join/tok123')
    expect(landing).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('postLoginRedirect')).toBeNull()
  })

  it('redirects to the single community', async () => {
    vi.spyOn(comp, 'useCommunities').mockReturnValue({
      active: { value: [] } as never,
      refresh: vi.fn(),
      landing: vi.fn().mockResolvedValue({ kind: 'one', slug: 'a' }),
    })
    const Index = (await import('@/pages/index.vue')).default
    mount(Index)
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/a/')
  })
  it('redirects to /communities when none', async () => {
    vi.spyOn(comp, 'useCommunities').mockReturnValue({
      active: { value: [] } as never,
      refresh: vi.fn(),
      landing: vi.fn().mockResolvedValue({ kind: 'none' }),
    })
    const Index = (await import('@/pages/index.vue')).default
    mount(Index)
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/communities')
  })
})
