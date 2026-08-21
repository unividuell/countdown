import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SongSearchBox from '@/games/songsnippet/SongSearchBox.vue'
import type { SongSuggestion } from '@/games/songsnippet/api'

const { searchSongs } = vi.hoisted(() => ({ searchSongs: vi.fn() }))
vi.mock('@/games/songsnippet/api', () => ({ searchSongs }))

const HITS: SongSuggestion[] = [
  { trackId: 1, artist: 'Eagles', title: 'Hotel California', coverUrl: null },
  { trackId: 2, artist: 'Juli', title: 'Perfekte Welle', coverUrl: null },
]

/** The box debounces by 300ms; the tests drive that clock rather than waiting on it. */
async function typeAndSettle(w: ReturnType<typeof mount>, text: string) {
  await w.get('[data-test="song-search"]').setValue(text)
  vi.advanceTimersByTime(400)
  await Promise.resolve()
  await w.vm.$nextTick()
}

describe('SongSearchBox', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    searchSongs.mockReset()
    searchSongs.mockResolvedValue(HITS)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('searches once the query is long enough, and not before', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false } })

    await typeAndSettle(w, 'ho')
    expect(searchSongs).not.toHaveBeenCalled()
    expect(w.find('[data-test="song-suggestions"]').exists()).toBe(false)

    await typeAndSettle(w, 'hotel')
    expect(searchSongs).toHaveBeenCalledWith('hotel', expect.anything())
    expect(w.findAll('[data-test="song-suggestions"] li')).toHaveLength(2)
  })

  it('emits the pick and empties itself — picking is submitting, so the field is free again', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false } })
    await typeAndSettle(w, 'hotel')

    await w.get('[data-test="song-suggestions"] button').trigger('click')

    expect(w.emitted('select')).toEqual([[HITS[0]]])
    expect(w.get<HTMLInputElement>('[data-test="song-search"]').element.value).toBe('')
    expect(w.find('[data-test="song-suggestions"]').exists()).toBe(false)
  })

  it('does not search again for the text a pick left behind', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false } })
    await typeAndSettle(w, 'hotel')
    await w.get('[data-test="song-suggestions"] button').trigger('click')

    vi.advanceTimersByTime(400)
    await Promise.resolve()

    expect(searchSongs).toHaveBeenCalledTimes(1)
  })

  it('offers a clear button only while something is typed, and it empties the box', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false } })
    expect(w.find('[data-test="song-search-clear"]').exists()).toBe(false)

    await typeAndSettle(w, 'hotel')
    expect(w.findAll('[data-test="song-suggestions"] li')).toHaveLength(2)

    await w.get('[data-test="song-search-clear"]').trigger('click')

    expect(w.get<HTMLInputElement>('[data-test="song-search"]').element.value).toBe('')
    expect(w.find('[data-test="song-suggestions"]').exists()).toBe(false)
    expect(w.find('[data-test="song-search-clear"]').exists()).toBe(false)
  })

  it('drops an answer that arrives after the box was cleared', async () => {
    let settle: (hits: SongSuggestion[]) => void = () => {}
    searchSongs.mockReturnValue(
      new Promise<SongSuggestion[]>((resolve) => {
        settle = resolve
      }),
    )
    const w = mount(SongSearchBox, { props: { disabled: false } })
    await typeAndSettle(w, 'hotel')

    await w.get('[data-test="song-search-clear"]').trigger('click')
    settle(HITS)
    await Promise.resolve()
    await w.vm.$nextTick()

    expect(w.find('[data-test="song-suggestions"]').exists()).toBe(false)
  })
})
