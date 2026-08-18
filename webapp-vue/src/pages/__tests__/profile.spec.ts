import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/profile/GlobalProfileBlock.vue', () => ({
  default: { template: '<div data-test="global-block" />' },
}))

describe('/profile', () => {
  it('shows the global block and nothing community-bound', async () => {
    const Page = (await import('@/pages/profile.vue')).default
    const w = mount(Page)
    expect(w.find('[data-test="global-block"]').exists()).toBe(true)
    expect(w.find('[data-test="community-block"]').exists()).toBe(false)
  })
})
