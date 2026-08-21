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
  assetUrl?: ((key: number) => string) | null
}) {
  return mount(SongSnippetBoard, {
    props: {
      durations: DURATIONS,
      stage: props.stage ?? 0,
      awardRule: props.awardRule ?? null,
      disabled: props.disabled ?? false,
      assetUrl: props.assetUrl === undefined ? (key: number) => `/assets/${key}` : props.assetUrl,
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

  it('rings the play button while the clip is on its way, and takes the ring away after', async () => {
    let deliver: (blob: Blob) => void = () => {}
    fetchAssetBlob.mockReturnValue(
      new Promise<Blob>((resolve) => {
        deliver = resolve
      }),
    )
    const w = mountBoard({ stage: 0 })

    // Cutting and fetching a stage takes 600-900ms of song pipeline; the greyed-out button alone
    // does not say that anything is happening.
    expect(w.get('[data-test="play-loading"]').attributes('aria-label')).toBe(
      'Ausschnitt wird geladen',
    )
    expect(w.get('[data-test="play"]').attributes('disabled')).toBeDefined()

    deliver(new Blob(['x']))
    await Promise.resolve()
    await w.vm.$nextTick()

    expect(w.find('[data-test="play-loading"]').exists()).toBe(false)
    expect(w.get('[data-test="play"]').attributes('disabled')).toBeUndefined()
  })

  it('says a clip did not load and makes the play button the retry', async () => {
    fetchAssetBlob.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mountBoard({ stage: 0 })
    await Promise.resolve()
    await Promise.resolve()
    await w.vm.$nextTick()

    // The one control that gets out of this, named — a stage can come free two ways and neither
    // is worth mentioning here.
    expect(w.get('[data-test="song-notice"]').text()).toBe(
      'Ausschnitt nicht geladen — Play antippen.',
    )
    const play = w.get('[data-test="play"]')
    expect(play.attributes('disabled')).toBeUndefined()
    expect(play.attributes('aria-label')).toBe('Ausschnitt erneut laden')

    fetchAssetBlob.mockResolvedValue(new Blob(['x']))
    await play.trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await w.vm.$nextTick()

    // Loaded and sounding, and the line is gone rather than sitting there stale.
    expect(fetchAssetBlob).toHaveBeenCalledTimes(2)
    expect(playbacks[0]!.restart).toHaveBeenCalledTimes(1)
    expect(w.find('[data-test="song-notice"]').exists()).toBe(false)
  })

  it('fetches nothing and offers nothing to press for a round that carries no audio', async () => {
    const w = mountBoard({ assetUrl: null })
    await Promise.resolve()

    expect(fetchAssetBlob).not.toHaveBeenCalled()
    expect(w.get('[data-test="play"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="play-loading"]').exists()).toBe(false)
  })

  it('does not sound a stage clip that lands after the round resolved', async () => {
    let deliver: (blob: Blob) => void = () => {}
    const w = mountBoard({ stage: 0 })
    await Promise.resolve()
    await Promise.resolve()
    fetchAssetBlob.mockReturnValue(
      new Promise<Blob>((resolve) => {
        deliver = resolve
      }),
    )
    await w.setProps({ stage: 1 })

    // The guess landed, the card is gone — and only now does its own fetch come back.
    w.unmount()
    deliver(new Blob(['x']))
    await Promise.resolve()
    await Promise.resolve()

    // Neither a clip nobody can stop nor an object URL nobody will revoke.
    expect(playbacks[0]!.restart).not.toHaveBeenCalled()
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('floats a verdict above the bar and takes it away again by itself', async () => {
    vi.useFakeTimers()
    try {
      const w = mountBoard({})
      expect(w.find('[data-test="song-notice"]').exists()).toBe(false)

      await w.setProps({ notice: 'Falsch — nächste Stufe frei.' })
      const line = w.get('[data-test="song-notice"]')
      expect(line.text()).toBe('Falsch — nächste Stufe frei.')
      // In the room the bar reserves for it, so it costs the card no height of its own.
      expect(line.classes()).toContain('absolute')
      expect(line.classes()).toContain('top-0')

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
