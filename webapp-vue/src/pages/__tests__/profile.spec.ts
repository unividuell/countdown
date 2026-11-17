import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const active = ref<{ id: string; name: string; slug: string }[]>([])
vi.mock('@/communities/useCommunities', async () => {
  const { computed } = await import('vue')
  return {
    useCommunities: () => ({ active, severalCommunities: computed(() => active.value.length > 1) }),
  }
})
vi.mock('@/profile/CommunityProfileBlock.vue', () => ({
  default: {
    template: '<div data-test="community-block" :data-slug="slug" :data-sole="String(sole)" />',
    props: { slug: String, communityName: String, sole: Boolean },
  },
}))
vi.mock('@/profile/GlobalProfileBlock.vue', () => ({
  default: {
    template: '<div data-test="global-block" :data-several="String(severalCommunities)" />',
    props: ['severalCommunities'],
  },
}))

beforeEach(() => {
  active.value = []
})

describe('/profile', () => {
  it('shows the global block and nothing community-bound', async () => {
    const Page = (await import('@/pages/profile.vue')).default
    const w = mount(Page)
    expect(w.find('[data-test="global-block"]').exists()).toBe(true)
    expect(w.find('[data-test="community-block"]').exists()).toBe(false)
  })

  it('edits the one community of a member of one', async () => {
    active.value = [{ id: '1', name: 'Team', slug: 'team' }]
    const Page = (await import('@/pages/profile.vue')).default
    const w = mount(Page)
    expect(w.get('[data-test="community-block"]').attributes('data-slug')).toBe('team')
    expect(w.get('[data-test="community-block"]').attributes('data-sole')).toBe('true')
    expect(w.find('[data-test="global-block"]').exists()).toBe(false)
  })

  it('tells the global block whether there are several communities', async () => {
    active.value = [
      { id: '1', name: 'Team', slug: 'team' },
      { id: '2', name: 'Other', slug: 'other' },
    ]
    const Page = (await import('@/pages/profile.vue')).default
    const w = mount(Page)
    expect(w.get('[data-test="global-block"]').attributes('data-several')).toBe('true')
  })
})
