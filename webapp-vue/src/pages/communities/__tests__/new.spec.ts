import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: push }) }))

describe('create community page', () => {
  beforeEach(() => push.mockReset())
  it('shows the live slug preview as the user types', async () => {
    const New = (await import('@/pages/communities/new.vue')).default
    const w = mount(New)
    await w.find('input').setValue('Hütte Hütte')
    expect(w.text()).toContain('huette-huette')
  })
  it('surfaces a 409 as a friendly message', async () => {
    vi.spyOn(api, 'createCommunity').mockRejectedValue(new ApiError(409, 'taken'))
    const New = (await import('@/pages/communities/new.vue')).default
    const w = mount(New)
    await w.find('input').setValue('Team A')
    await w.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(w.text()).toMatch(/bereits vergeben|Namen anpassen/i)
    expect(push).not.toHaveBeenCalled()
  })
})
