import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }), useRoute: () => ({ params: { token: 'tok' } }) }))

describe('join page', () => {
  beforeEach(() => replace.mockReset())
  it('shows waiting on JOINED_PENDING', async () => {
    vi.spyOn(api, 'joinByToken').mockResolvedValue({ status: 'JOINED_PENDING', name: 'Team', slug: 'team' })
    const W = (await import('@/pages/join/[token].vue')).default
    const w = mount(W)
    await flushPromises()
    expect(w.text()).toMatch(/Bestätigung|Team/)
  })
  it('redirects on ALREADY_ACTIVE', async () => {
    vi.spyOn(api, 'joinByToken').mockResolvedValue({ status: 'ALREADY_ACTIVE', name: 'Team', slug: 'team' })
    const W = (await import('@/pages/join/[token].vue')).default
    mount(W)
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/team/')
  })
  it('shows expired on 410', async () => {
    vi.spyOn(api, 'joinByToken').mockRejectedValue(new ApiError(410, 'gone'))
    const W = (await import('@/pages/join/[token].vue')).default
    const w = mount(W)
    await flushPromises()
    expect(w.text()).toMatch(/abgelaufen|ungültig/i)
  })
})
