import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import type { CommunityResponse } from '@/api/types'

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/communities/useAdminGuard', () => ({ useAdminGuard: vi.fn() }))
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: { value: { slug: 'team', name: 'Team', viewerIsAdmin: true } },
    refresh: vi.fn(),
  }),
}))

describe('settings — name', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getInvite').mockResolvedValue(null)
    vi.spyOn(api, 'updateCommunity').mockResolvedValue({} as CommunityResponse)
  })

  it('prefills the name from the community in context', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    expect((w.find('input').element as HTMLInputElement).value).toBe('Team')
  })

  it('saves only the trimmed name', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('input').setValue('  Team Nord ')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith('team', 'Team Nord')
  })

  it('shows the community URL prefixed with /c/, not the bare slug', async () => {
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    expect(w.text()).toContain('/c/team/')
  })
})
