import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const refresh = vi.fn().mockResolvedValue(undefined)
const refreshInherited = vi.fn()
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: { value: { slug: 'team', name: 'Team' } },
    refresh,
  }),
}))
const active = ref([
  { id: '1', name: 'Team', slug: 'team' },
  { id: '2', name: 'Other', slug: 'other' },
])
vi.mock('@/communities/useCommunities', async () => {
  const { computed } = await import('vue')
  return {
    useCommunities: () => ({ active, severalCommunities: computed(() => active.value.length > 1) }),
  }
})
vi.mock('@/profile/GlobalProfileBlock.vue', () => ({
  default: {
    template:
      '<button data-test="global-block" :data-several="String(severalCommunities)" @click="$emit(\'saved\')" />',
    props: ['severalCommunities'],
    emits: ['saved'],
  },
}))
vi.mock('@/profile/CommunityProfileBlock.vue', () => ({
  default: {
    template: '<button data-test="community-block" @click="$emit(\'saved\')" />',
    props: ['slug', 'communityName'],
    emits: ['saved'],
    methods: { refreshInherited },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  active.value = [
    { id: '1', name: 'Team', slug: 'team' },
    { id: '2', name: 'Other', slug: 'other' },
  ]
})

describe('/c/:slug/profile', () => {
  it('shows the community block above the global one', async () => {
    const Page = (await import('@/pages/c/[slug]/profile.vue')).default
    const w = mount(Page)
    const html = w.html()
    expect(html.indexOf('community-block')).toBeLessThan(html.indexOf('global-block'))
  })

  it('refreshes the community once the override was saved, so the header follows', async () => {
    const Page = (await import('@/pages/c/[slug]/profile.vue')).default
    const w = mount(Page)
    await w.get('[data-test="community-block"]').trigger('click')
    expect(refresh).toHaveBeenCalled()
  })

  // The header draws `activeCommunity.viewerIdentity ?? user.avatar`, and the community-bound
  // half wins the `??`. Without this the header would keep the pre-save initials until the user
  // left the community area entirely — the roster on this very page already shows the new name.
  it('refreshes the community after a GLOBAL save too, so the header cannot go stale', async () => {
    const Page = (await import('@/pages/c/[slug]/profile.vue')).default
    const w = mount(Page)
    await w.get('[data-test="global-block"]').trigger('click')
    expect(refresh).toHaveBeenCalled()
  })

  it('has the community block restate what is inherited after a global save', async () => {
    const Page = (await import('@/pages/c/[slug]/profile.vue')).default
    const w = mount(Page)
    await w.get('[data-test="global-block"]').trigger('click')
    expect(refreshInherited).toHaveBeenCalled()
  })

  it('leaves the inherited line alone when only the override was saved', async () => {
    const Page = (await import('@/pages/c/[slug]/profile.vue')).default
    const w = mount(Page)
    await w.get('[data-test="community-block"]').trigger('click')
    expect(refreshInherited).not.toHaveBeenCalled()
  })

  it('offers the split only to a member of several communities', async () => {
    const Page = (await import('@/pages/c/[slug]/profile.vue')).default
    const w = mount(Page)
    expect(w.get('[data-test="global-block"]').attributes('data-several')).toBe('true')
  })

  it('shows a member of one community the global profile alone', async () => {
    active.value = [{ id: '1', name: 'Team', slug: 'team' }]
    const Page = (await import('@/pages/c/[slug]/profile.vue')).default
    const w = mount(Page)
    expect(w.find('[data-test="community-block"]').exists()).toBe(false)
    expect(w.get('[data-test="global-block"]').attributes('data-several')).toBe('false')
  })
})
