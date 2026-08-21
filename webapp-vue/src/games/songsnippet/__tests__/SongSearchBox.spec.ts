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
    expect(w.findAll('[data-test="song-hit"]')).toHaveLength(0)

    await typeAndSettle(w, 'hotel')
    expect(searchSongs).toHaveBeenCalledWith('hotel', expect.anything())
    expect(w.findAll('[data-test="song-hit"]')).toHaveLength(2)
  })

  it('emits the pick and empties itself — picking is submitting, so the field is free again', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false } })
    await typeAndSettle(w, 'hotel')

    await w.get('[data-test="song-hit"]').trigger('click')

    expect(w.emitted('select')).toEqual([[HITS[0]]])
    expect(w.get<HTMLInputElement>('[data-test="song-search"]').element.value).toBe('')
    expect(w.findAll('[data-test="song-hit"]')).toHaveLength(0)
  })

  it('does not search again for the text a pick left behind', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false } })
    await typeAndSettle(w, 'hotel')
    await w.get('[data-test="song-hit"]').trigger('click')

    vi.advanceTimersByTime(400)
    await Promise.resolve()

    expect(searchSongs).toHaveBeenCalledTimes(1)
  })

  it('offers a clear button only while something is typed, and it empties the box', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false } })
    expect(w.find('[data-test="song-search-clear"]').exists()).toBe(false)

    await typeAndSettle(w, 'hotel')
    expect(w.findAll('[data-test="song-hit"]')).toHaveLength(2)

    await w.get('[data-test="song-search-clear"]').trigger('click')

    expect(w.get<HTMLInputElement>('[data-test="song-search"]').element.value).toBe('')
    expect(w.findAll('[data-test="song-hit"]')).toHaveLength(0)
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

    expect(w.findAll('[data-test="song-hit"]')).toHaveLength(0)
  })

  it('holds three rows of three open whatever the search found, so the card never moves', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false } })
    const slots = () =>
      w.findAll('[data-test="song-hit"]').length + w.findAll('[data-test="song-hit-blank"]').length

    expect(slots()).toBe(9)

    await typeAndSettle(w, 'hotel')
    expect(w.findAll('[data-test="song-hit"]')).toHaveLength(2)
    expect(slots()).toBe(9)
  })

  it('spins every waiting slot while a request is out, and stops when it lands', async () => {
    let settle: (hits: SongSuggestion[]) => void = () => {}
    searchSongs.mockReturnValue(
      new Promise<SongSuggestion[]>((resolve) => {
        settle = resolve
      }),
    )
    const w = mount(SongSearchBox, { props: { disabled: false } })
    expect(w.findAll('[data-test="song-hit-spinner"]')).toHaveLength(0)

    await typeAndSettle(w, 'hotel')
    expect(w.findAll('[data-test="song-hit-spinner"]')).toHaveLength(9)

    settle(HITS)
    await Promise.resolve()
    await w.vm.$nextTick()

    expect(w.findAll('[data-test="song-hit-spinner"]')).toHaveLength(0)
  })

  it('keeps the field focused when clearing, so the keyboard stays up', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false }, attachTo: document.body })
    await typeAndSettle(w, 'hotel')
    const input = w.get<HTMLInputElement>('[data-test="song-search"]').element
    input.focus()

    await w.get('[data-test="song-search-clear"]').trigger('click')

    expect(document.activeElement).toBe(input)
    w.unmount()
  })

  it('shows every hit it was given, filling the last row up', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      trackId: i + 10,
      artist: `artist ${i}`,
      title: `title ${i}`,
      coverUrl: null,
    }))
    searchSongs.mockResolvedValue(many)
    const w = mount(SongSearchBox, { props: { disabled: false } })

    await typeAndSettle(w, 'hotel')

    expect(w.findAll('[data-test="song-hit"]')).toHaveLength(8)
    // Eight hits are two full rows and a third holding two — one blank finishes it.
    expect(w.findAll('[data-test="song-hit-blank"]')).toHaveLength(1)
  })

  it('scrolls the strip back to the top whenever new hits arrive', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false } })
    await typeAndSettle(w, 'hotel')

    const box = w.get('[data-test="song-suggestions-box"]').element
    box.scrollTop = 40
    searchSongs.mockResolvedValue([
      { trackId: 3, artist: 'Nena', title: '99 Luftballons', coverUrl: null },
    ])
    await typeAndSettle(w, 'luftballons')

    expect(box.scrollTop).toBe(0)
  })

  it('writes each hit over its own cover, title above artist', async () => {
    const w = mount(SongSearchBox, { props: { disabled: false } })
    await typeAndSettle(w, 'hotel')

    const first = w.findAll('[data-test="song-hit"]')[0]!
    expect(first.findAll('[data-test="ticker-text"]').map((s) => s.text())).toEqual([
      'Hotel California',
      'Eagles',
    ])
    expect(first.attributes('aria-label')).toBe('Hotel California von Eagles tippen')
  })
})
