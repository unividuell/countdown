import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import GlobalProfileBlock from '@/profile/GlobalProfileBlock.vue'
import * as api from '@/api/profile'
import { ApiError } from '@/api/client'
import { PREVIEW_DEBOUNCE_MS } from '@/profile/useProfileDraft'
import type { MeResponse } from '@/api/types'

enableAutoUnmount(afterEach)

const me: MeResponse = {
  id: 'u1',
  username: 'The Octocat',
  displayName: null,
  githubLogin: 'octocat',
  githubName: 'The Octocat',
  email: null,
  bgColorHex: null,
  avatar: { shortName: 'THCT', bgColorHex: '#123456' },
  isSuperAdmin: false,
  mayCreateCommunities: false,
  createdAt: null,
}

const bootstrap = vi.fn().mockResolvedValue(undefined)
// A shared, mutable ref (not a fresh `ref(me)` per `useAuth()` call): the "resolves after mount"
// test below needs to flip the session from unresolved to resolved underneath an already-mounted
// component, the same way the real module-level `user` ref behaves.
const currentUser = ref<MeResponse | null>(me)
vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ user: currentUser, bootstrap }),
}))
vi.mock('@/api/profile', () => ({
  updateProfile: vi.fn(),
  previewAvatar: vi.fn(),
}))

beforeEach(() => {
  // Without this, a `toHaveBeenCalled` here proves only that SOME earlier test in this file
  // clicked Save — every case below saves.
  vi.clearAllMocks()
  currentUser.value = me
  vi.mocked(api.updateProfile).mockResolvedValue({ ...me, displayName: 'Leela', username: 'Leela' })
  vi.mocked(api.previewAvatar).mockResolvedValue({
    username: 'Leela',
    avatar: { shortName: 'LL', bgColorHex: '#123456' },
  })
})

describe('GlobalProfileBlock', () => {
  it('shows the github name as the placeholder of an empty name field', () => {
    const w = mount(GlobalProfileBlock)
    const input = w.get('[data-test="global-name"]').element as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('The Octocat')
  })

  it('caps the name field at the length the server accepts', () => {
    const w = mount(GlobalProfileBlock)
    expect(w.get('[data-test="global-name"]').attributes('maxlength')).toBe('32')
  })

  it('draws the avatar the server last answered with', () => {
    const w = mount(GlobalProfileBlock)
    expect(w.get('[data-test="global-preview"]').text()).toBe('THCT')
  })

  it('sends null for a colour left on automatic', async () => {
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-name"]').setValue('Leela')
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: 'Leela', bgColorHex: null })
  })

  it('sends the picked colour once it has been picked', async () => {
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-color"]').setValue('#8e44ad')
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: null, bgColorHex: '#8e44ad' })
  })

  it('the automatic button drops back to the derived colour', async () => {
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-color"]').setValue('#8e44ad')
    await w.get('[data-test="global-auto"]').trigger('click')
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: null, bgColorHex: null })
  })

  it('refreshes the session after saving, so the header agrees', async () => {
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(bootstrap).toHaveBeenCalled()
  })

  it('announces the save, so whatever surrounds it can catch up too', async () => {
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(w.emitted('saved')).toHaveLength(1)
  })

  it('announces nothing when the save failed', async () => {
    vi.mocked(api.updateProfile).mockRejectedValue(new Error('nope'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(w.emitted('saved')).toBeUndefined()
  })

  it('shows a message when saving fails', async () => {
    vi.mocked(api.updateProfile).mockRejectedValue(new Error('nope'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(w.get('[data-test="global-error"]').text()).toContain('fehlgeschlagen')
  })

  it('repeats what the server objected to, rather than only that something failed', async () => {
    vi.mocked(api.updateProfile).mockRejectedValue(
      new ApiError(400, 'request failed: 400', {
        detail: 'bgColorHex must be a valid hex colour in the form #rrggbb, got: 12345',
      }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(w.get('[data-test="global-error"]').text()).toContain('bgColorHex must be a valid hex')
  })

  // The row may predate the server's own length limit: `PATCH /api/me` used to store the name raw
  // and V5 does not normalise what is already there.
  it('cuts a stored name longer than the server would now accept', () => {
    currentUser.value = { ...me, displayName: 'z'.repeat(40), username: 'z'.repeat(40) }
    const w = mount(GlobalProfileBlock)

    expect((w.get('[data-test="global-name"]').element as HTMLInputElement).value).toHaveLength(32)
  })

  it('seeds once the session resolves after this component has already mounted', async () => {
    currentUser.value = null
    const w = mount(GlobalProfileBlock)

    const input = w.get('[data-test="global-name"]').element as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('')
    expect(w.find('[data-test="global-preview"]').exists()).toBe(false)

    currentUser.value = me
    await nextTick()

    expect((w.get('[data-test="global-name"]').element as HTMLInputElement).placeholder).toBe(
      'The Octocat',
    )
    expect(w.get('[data-test="global-preview"]').text()).toBe('THCT')
  })

  it('previews while typing, after the debounce', async () => {
    vi.useFakeTimers()
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-name"]').setValue('Leela')
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    await vi.runOnlyPendingTimersAsync()

    expect(api.previewAvatar).toHaveBeenCalledWith({ displayName: 'Leela', bgColorHex: null })
    expect(w.get('[data-test="global-preview"]').text()).toBe('LL')
    vi.useRealTimers()
  })
})
