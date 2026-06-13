import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Login from '@/pages/login.vue'

describe('login.vue', () => {
  afterEach(() => vi.restoreAllMocks())

  it('navigates to the server login entry (server decides github vs test picker)', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign } as unknown as Location)
    const wrapper = mount(Login)
    await wrapper.get('[data-test="login-github"]').trigger('click')
    expect(assign).toHaveBeenCalledWith('/login/github')
  })
})
