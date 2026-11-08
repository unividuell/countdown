import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const several = ref(false)
vi.mock('@/communities/useCommunities', () => ({
  useCommunities: () => ({ severalCommunities: several }),
}))
vi.mock('@/profile/GlobalProfileBlock.vue', () => ({
  default: {
    template: '<div data-test="global-block" :data-several="String(severalCommunities)" />',
    props: ['severalCommunities'],
  },
}))

describe('/profile', () => {
  it('shows the global block and nothing community-bound', async () => {
    const Page = (await import('@/pages/profile.vue')).default
    const w = mount(Page)
    expect(w.find('[data-test="global-block"]').exists()).toBe(true)
    expect(w.find('[data-test="community-block"]').exists()).toBe(false)
  })

  it('tells the global block whether there are several communities', async () => {
    several.value = true
    const Page = (await import('@/pages/profile.vue')).default
    const w = mount(Page)
    expect(w.get('[data-test="global-block"]').attributes('data-several')).toBe('true')
  })
})
