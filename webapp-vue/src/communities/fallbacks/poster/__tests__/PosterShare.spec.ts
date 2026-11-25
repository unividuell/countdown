import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import PosterShare from '@/communities/fallbacks/poster/PosterShare.vue'
import { renderPoster, sharePicture } from '@/communities/fallbacks/poster/share'

vi.mock('@/communities/fallbacks/poster/share', async (original) => ({
  ...(await original<typeof import('@/communities/fallbacks/poster/share')>()),
  renderPoster: vi.fn(),
  sharePicture: vi.fn(),
}))

enableAutoUnmount(afterEach)

const text = ref('Fry')

/** A poster with the button inside it, as a variant places it. */
const Poster = defineComponent(
  () => () =>
    h('div', { 'data-poster': '' }, [
      h('p', text.value),
      h(PosterShare, { fileName: 'team-2026-06-14', title: "Team '26" }),
    ]),
)

beforeEach(() => {
  text.value = 'Fry'
  vi.mocked(renderPoster)
    .mockReset()
    .mockResolvedValue(new Blob(['png']))
  vi.mocked(sharePicture).mockReset().mockResolvedValue('shared')
})

describe('PosterShare', () => {
  it('renders the poster it sits in and only then shows itself', async () => {
    let resolve: (blob: Blob) => void = () => {}
    vi.mocked(renderPoster).mockReturnValue(new Promise((r) => (resolve = r)))
    const w = mount(Poster, { attachTo: document.body })
    await flushPromises()

    const button = w.get('[data-test="poster-share"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(vi.mocked(renderPoster).mock.calls[0]?.[0]).toBe(w.element)

    resolve(new Blob(['png']))
    await flushPromises()
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('shares the file it rendered ahead', async () => {
    const w = mount(Poster, { attachTo: document.body })
    await flushPromises()
    await w.get('[data-test="poster-share"]').trigger('click')

    const [shared, title] = vi.mocked(sharePicture).mock.calls[0]!
    expect(shared.name).toBe('team-2026-06-14.png')
    expect(shared.type).toBe('image/png')
    expect(title).toBe("Team '26")
  })

  it('renders again when the poster changes', async () => {
    vi.useFakeTimers()
    mount(Poster, { attachTo: document.body })
    await vi.runAllTimersAsync()
    expect(renderPoster).toHaveBeenCalledOnce()

    text.value = 'Leela'
    await vi.runAllTimersAsync()
    expect(renderPoster).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
