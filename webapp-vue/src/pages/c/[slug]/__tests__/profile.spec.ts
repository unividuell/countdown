import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const refresh = vi.fn().mockResolvedValue(undefined)
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: { value: { slug: 'team', name: 'Team' } },
    refresh,
  }),
}))
vi.mock('@/profile/GlobalProfileBlock.vue', () => ({
  default: { template: '<div data-test="global-block" />' },
}))
vi.mock('@/profile/CommunityProfileBlock.vue', () => ({
  default: {
    template: '<button data-test="community-block" @click="$emit(\'saved\')" />',
    props: ['slug', 'communityName'],
    emits: ['saved'],
  },
}))

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
})
