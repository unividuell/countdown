import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { _resetCommunitiesState } from '@/communities/useCommunities'
import { _resetLandingState, landingFailed } from '@/communities/landingGuard'

const replace = vi.fn().mockResolvedValue(undefined)
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

async function mountIndex() {
  const Index = (await import('@/pages/index.vue')).default
  return mount(Index)
}

describe('landing page', () => {
  beforeEach(() => {
    replace.mockClear()
    sessionStorage.clear()
    _resetLandingState()
    _resetCommunitiesState()
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows nothing actionable on the happy path — the guard redirects before it renders', async () => {
    const w = await mountIndex()
    // Not just "no retry button": nothing at all, including the old loading
    // placeholder — that placeholder is the user-visible half of the reported bug.
    expect(w.text()).toBe('')
  })

  it('offers a retry once the landing resolution has failed', async () => {
    landingFailed.value = true
    const w = await mountIndex()
    expect(w.text()).toMatch(/schiefgelaufen/i)
    expect(w.find('[data-test=landing-retry]').exists()).toBe(true)
  })

  it('navigates to the resolved target when the retry succeeds', async () => {
    landingFailed.value = true
    vi.spyOn(api, 'listCommunities').mockResolvedValue([{ id: 'c1', name: 'Team', slug: 'team' }])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    const w = await mountIndex()
    await w.find('[data-test=landing-retry]').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/c/team/')
    expect(landingFailed.value).toBe(false)
  })

  it('stays on the error view when the retry fails again', async () => {
    landingFailed.value = true
    vi.spyOn(api, 'listCommunities').mockRejectedValue(new Error('still offline'))
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = await mountIndex()
    await w.find('[data-test=landing-retry]').trigger('click')
    await flushPromises()
    expect(replace).not.toHaveBeenCalled()
    expect(landingFailed.value).toBe(true)
  })

  it('leaves the retry affordance in place when the navigation does not move the user', async () => {
    landingFailed.value = true
    vi.spyOn(api, 'listCommunities').mockResolvedValue([{ id: 'c1', name: 'Team', slug: 'team' }])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    // router.replace() resolves — it does not reject — for an aborted/cancelled
    // navigation, so a resolved-but-truthy NavigationFailure must not be mistaken
    // for success.
    replace.mockResolvedValueOnce({ type: 2 })
    const w = await mountIndex()
    await w.find('[data-test=landing-retry]').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/c/team/')
    expect(landingFailed.value).toBe(true)
    expect(w.find('[data-test=landing-retry]').exists()).toBe(true)
  })
})
