import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Mock } from 'vitest'
import type { Ref } from 'vue'
import SongSnippetBoard from '@/games/songsnippet/SongSnippetBoard.vue'
import type { SongSuggestion } from '@/games/songsnippet/api'

interface PlaybackStub {
  positionSeconds: Ref<number>
  playing: Ref<boolean>
  setSource: Mock
  restart: Mock
  pause: Mock
  dispose: Mock
}

const { fetchAssetBlob } = vi.hoisted(() => ({ fetchAssetBlob: vi.fn() }))
vi.mock('@/api/assets', () => ({ fetchAssetBlob }))

const { playbacks } = vi.hoisted(() => ({ playbacks: [] as PlaybackStub[] }))
vi.mock('@/games/songsnippet/usePlayback', async () => {
  const { ref } = await import('vue')
  const { vi: vitest } = await import('vitest')
  return {
    usePlayback: () => {
      const stub: PlaybackStub = {
        positionSeconds: ref(0),
        playing: ref(false),
        setSource: vitest.fn(),
        restart: vitest.fn(),
        pause: vitest.fn(),
        dispose: vitest.fn(),
      }
      playbacks.push(stub)
      return stub
    },
  }
})

/** The search box brings its own network and debounce; the board only cares that a pick arrives. */
vi.mock('@/games/songsnippet/SongSearchBox.vue', () => ({
  default: {
    name: 'SongSearchBox',
    props: ['disabled'],
    emits: ['select'],
    template: '<div data-test="search-stub" />',
  },
}))

const DURATIONS = [0.1, 0.5, 2, 8, 15]

const HIT: SongSuggestion = {
  trackId: 426703682,
  artist: 'Eagles',
  title: 'Hotel California',
  coverUrl: null,
}

function mountBoard(props: {
  stage?: number
  awardRule?: 'ALL_QUALIFYING' | 'CLOSEST_ONLY' | null
  disabled?: boolean
  notice?: string | null
}) {
  return mount(SongSnippetBoard, {
    props: {
      durations: DURATIONS,
      stage: props.stage ?? 0,
      awardRule: props.awardRule ?? null,
      disabled: props.disabled ?? false,
      assetUrl: (key: number) => `/assets/${key}`,
      notice: props.notice ?? null,
    },
  })
}

describe('SongSnippetBoard', () => {
  beforeEach(() => {
    fetchAssetBlob.mockReset()
    fetchAssetBlob.mockResolvedValue(new Blob(['x']))
    playbacks.length = 0
    URL.createObjectURL = vi.fn(() => 'blob:stage')
    URL.revokeObjectURL = vi.fn()
  })

  it('submits the guess with the pick itself — there is no separate confirm button', async () => {
    const w = mountBoard({})

    await w.findComponent({ name: 'SongSearchBox' }).vm.$emit('select', HIT)

    expect(w.emitted('guess')).toEqual([[HIT]])
  })

  it('skips from the stage it is showing, and cannot skip off the top', () => {
    const w = mountBoard({ stage: 2 })
    w.get('[data-test="skip"]').trigger('click')
    expect(w.emitted('skip')).toEqual([[2]])

    const top = mountBoard({ stage: DURATIONS.length - 1 })
    expect(top.get('[data-test="skip"]').attributes('disabled')).toBeDefined()
  })

  it('says what a skip costs in its title, and keeps its outline plain either way', () => {
    const cheap = mountBoard({ awardRule: 'ALL_QUALIFYING' }).get('[data-test="skip"]')
    const dear = mountBoard({ awardRule: 'CLOSEST_ONLY' }).get('[data-test="skip"]')

    expect(cheap.attributes('title')).toContain('kostet nur Ruhm')
    expect(dear.attributes('title')).toContain('kann den Sieg kosten')
    expect(cheap.classes()).toContain('border-neutral-300')
    expect(dear.classes()).toContain('border-neutral-300')
  })

  it('gives up on a single press of an ordinary button', async () => {
    const w = mountBoard({})

    await w.get('[data-test="give-up"]').trigger('click')

    expect(w.emitted('giveUp')).toHaveLength(1)
  })

  it('loads the stage clip on arrival without sounding it', async () => {
    mountBoard({ stage: 0 })
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchAssetBlob).toHaveBeenCalledWith('/assets/0')
    expect(playbacks[0]!.setSource).toHaveBeenCalledWith('blob:stage')
    expect(playbacks[0]!.restart).not.toHaveBeenCalled()
  })

  it('plays the longer clip by itself once the stage grows', async () => {
    const w = mountBoard({ stage: 0 })
    await Promise.resolve()
    await Promise.resolve()

    await w.setProps({ stage: 1 })
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchAssetBlob).toHaveBeenLastCalledWith('/assets/1')
    expect(playbacks[0]!.restart).toHaveBeenCalledTimes(1)
  })

  it('floats a verdict above the bar and takes it away again by itself', async () => {
    vi.useFakeTimers()
    try {
      const w = mountBoard({})
      expect(w.find('[data-test="song-notice"]').exists()).toBe(false)

      await w.setProps({ notice: 'Falsch — nächste Stufe frei.' })
      const line = w.get('[data-test="song-notice"]')
      expect(line.text()).toBe('Falsch — nächste Stufe frei.')
      // Floating: it borrows the space above the bar rather than taking any of its own.
      expect(line.classes()).toContain('absolute')
      expect(line.classes()).toContain('bottom-full')

      vi.advanceTimersByTime(2000)
      await w.vm.$nextTick()

      expect(w.find('[data-test="song-notice"]').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts the welcome of a second verdict, rather than letting it inherit the first', async () => {
    vi.useFakeTimers()
    try {
      const w = mountBoard({ notice: 'Falsch — nächste Stufe frei.' })
      vi.advanceTimersByTime(1500)

      await w.setProps({ notice: null })
      await w.setProps({ notice: 'Falsch — nächste Stufe frei.' })
      vi.advanceTimersByTime(1500)
      await w.vm.$nextTick()

      // The second verdict gets its own two seconds, not the remainder of the first.
      expect(w.find('[data-test="song-notice"]').exists()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("lays the card out in the reveal's own order, with give-up last of all", () => {
    const w = mountBoard({})

    const rows = [...w.element.children].map(
      (row) =>
        row.getAttribute('data-test') ??
        row.querySelector('[data-test]')?.getAttribute('data-test'),
    )
    // Hits and field first (both the search box's), then the bar, then the transport — the reveal
    // fills the same rows with the cover and the title, so nothing moves when the round resolves.
    expect(rows).toEqual(['search-stub', 'stage-bar', 'pause', 'give-up'])
  })

  it('says nothing about what a guess costs — the skip outline carries that', () => {
    const one = mountBoard({ awardRule: 'ALL_QUALIFYING' })
    const two = mountBoard({ awardRule: 'CLOSEST_ONLY' })

    expect(one.text()).not.toContain('verbrennt')
    expect(two.text()).not.toContain('verbrennen')
  })
})
