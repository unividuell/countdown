import { describe, expect, it, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { PREVIEW_DEBOUNCE_MS, useProfileDraft } from '@/profile/useProfileDraft'
import type { IdentityView } from '@/api/types'

const identity = (username: string, shortName: string, bgColorHex = '#8e44ad'): IdentityView => ({
  username,
  avatar: { shortName, bgColorHex },
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useProfileDraft', () => {
  it('seeds the fields from the stored values and the preview from the drawn one', () => {
    const draft = useProfileDraft(vi.fn())
    draft.seed('Zwerg', '#8e44ad', identity('Zwerg', 'ZWRG'))

    expect(draft.name.value).toBe('Zwerg')
    expect(draft.colorSet.value).toBe(true)
    expect(draft.colorInput.value).toBe('#8e44ad')
    expect(draft.preview.value).toEqual(identity('Zwerg', 'ZWRG'))
  })

  it('without a stored colour it seeds the picker from the drawn one but stays unset', () => {
    const draft = useProfileDraft(vi.fn())
    draft.seed(null, null, identity('Amy Wong', 'AMYW', '#123456'))

    expect(draft.colorSet.value).toBe(false)
    expect(draft.colorInput.value).toBe('#123456')
    expect(draft.body.value).toEqual({ displayName: null, bgColorHex: null })
  })

  it('asks the server once, after the debounce, and takes the answer', async () => {
    vi.useFakeTimers()
    const fetchPreview = vi.fn().mockResolvedValue(identity('Zwerg', 'ZWRG'))
    const draft = useProfileDraft(fetchPreview)
    draft.seed(null, null, identity('Amy Wong', 'AMYW'))

    draft.name.value = 'Zw'
    await nextTick()
    draft.name.value = 'Zwerg'
    await nextTick()
    expect(fetchPreview).not.toHaveBeenCalled()

    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    await vi.runOnlyPendingTimersAsync()

    expect(fetchPreview).toHaveBeenCalledTimes(1)
    expect(fetchPreview).toHaveBeenCalledWith({ displayName: 'Zwerg', bgColorHex: null })
    expect(draft.preview.value).toEqual(identity('Zwerg', 'ZWRG'))
  })

  it('drops an answer that arrives after a newer one', async () => {
    vi.useFakeTimers()
    let resolveFirst: (v: IdentityView) => void = () => {}
    const fetchPreview = vi
      .fn()
      .mockImplementationOnce(() => new Promise<IdentityView>((r) => (resolveFirst = r)))
      .mockResolvedValueOnce(identity('Klemens', 'KLMN'))
    const draft = useProfileDraft(fetchPreview)
    draft.seed(null, null, identity('Amy Wong', 'AMYW'))

    draft.name.value = 'Kle'
    await nextTick()
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    await vi.runOnlyPendingTimersAsync()

    draft.name.value = 'Klemens'
    await nextTick()
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    await vi.runOnlyPendingTimersAsync()

    // The stale first request answers last; it must not win.
    resolveFirst(identity('Kle', 'KL'))
    await vi.runOnlyPendingTimersAsync()

    expect(draft.preview.value).toEqual(identity('Klemens', 'KLMN'))
  })

  it('keeps the last good avatar when a preview fails', async () => {
    vi.useFakeTimers()
    const fetchPreview = vi.fn().mockRejectedValue(new Error('nope'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const draft = useProfileDraft(fetchPreview)
    draft.seed(null, null, identity('Amy Wong', 'AMYW'))

    draft.name.value = 'Zwerg'
    await nextTick()
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    await vi.runOnlyPendingTimersAsync()

    expect(draft.preview.value).toEqual(identity('Amy Wong', 'AMYW'))
  })
})
