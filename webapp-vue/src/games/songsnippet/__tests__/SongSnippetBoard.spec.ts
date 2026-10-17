import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import type { Mock } from 'vitest'
import type { Ref } from 'vue'
import type { AssetKey, RoundAssets } from '@/api/assets'
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

const fetchMock = vi.fn()

const KEY_BYTES = new Uint8Array(32).fill(7)
const base64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const key = (bytes: Uint8Array = KEY_BYTES): AssetKey => ({
  key: base64(bytes),
  mediaType: 'audio/mpeg',
})

/** What the server serves for a sealed clip: `nonce ‖ ciphertext ‖ tag`, the plaintext its own name. */
function sealedClip(name: string): Response {
  const nonce = new Uint8Array(12).fill(1)
  const body = chacha20poly1305(KEY_BYTES, nonce).encrypt(new TextEncoder().encode(name))
  return new Response(Uint8Array.from([...nonce, ...body]) as BodyInit)
}

/** The round's assets with exactly these clips opened — a stage's key arrives with the stage. */
const assetsWith = (...clips: number[]): RoundAssets => ({
  url: (name) => `/assets/${name}`,
  key: (name) => (clips.some((stage) => name === `clip-${stage}`) ? key() : null),
})

const fetchedUrls = (): unknown[] => fetchMock.mock.calls.map((call) => call[0])

/** Each `fetch` hands back its own `Response`: a body can be read once. */
const serveClips = () =>
  fetchMock.mockImplementation(async (url: string) => sealedClip(url.split('/').pop()!))

function mountBoard(props: {
  stage?: number
  awardRule?: 'ALL_QUALIFYING' | 'CLOSEST_ONLY' | null
  awardPoints?: number | null
  disabled?: boolean
  notice?: string | null
  assets?: RoundAssets | null
}) {
  return mount(SongSnippetBoard, {
    props: {
      durations: DURATIONS,
      stage: props.stage ?? 0,
      awardRule: props.awardRule ?? null,
      awardPoints: props.awardPoints ?? null,
      disabled: props.disabled ?? false,
      assets: props.assets === undefined ? assetsWith(0, 1, 2, 3, 4) : props.assets,
      notice: props.notice ?? null,
    },
  })
}

describe('SongSnippetBoard', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    serveClips()
    vi.stubGlobal('fetch', fetchMock)
    playbacks.length = 0
    URL.createObjectURL = vi.fn(() => 'blob:stage')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => vi.unstubAllGlobals())

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
    await flushPromises()

    expect(fetchedUrls()).toEqual(['/assets/clip-0'])
    expect(playbacks[0]!.setSource).toHaveBeenCalledWith('blob:stage')
    expect(playbacks[0]!.restart).not.toHaveBeenCalled()
  })

  it('plays the longer clip by itself once the stage grows', async () => {
    const w = mountBoard({ stage: 0 })
    await flushPromises()

    await w.setProps({ stage: 1 })
    await flushPromises()

    expect(fetchedUrls().at(-1)).toBe('/assets/clip-1')
    expect(playbacks[0]!.restart).toHaveBeenCalledTimes(1)
  })

  it('a skip loads the next clip sealed and opens it with the key that came with it', async () => {
    const w = mountBoard({ stage: 0, assets: assetsWith(0) })
    await flushPromises()

    // The round that carries stage 1 carries clip-1's key too — one response, one render.
    await w.setProps({ stage: 1, assets: assetsWith(0, 1) })
    await flushPromises()

    expect(fetchedUrls()).toEqual(['/assets/clip-0', '/assets/clip-1'])
    expect(playbacks[0]!.setSource).toHaveBeenLastCalledWith('blob:stage')
    const opened = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob
    expect(opened.type).toBe('audio/mpeg')
    expect(new TextDecoder().decode(await opened.arrayBuffer())).toBe('clip-1')
  })

  it('a clip that does not open shows the load error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrongKey: RoundAssets = {
      url: (name) => `/assets/${name}`,
      key: () => key(new Uint8Array(32).fill(9)),
    }
    const w = mountBoard({ stage: 0, assets: wrongKey })
    await flushPromises()

    // Both attempts: the second one past the cache, and neither opens.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/assets/clip-0',
      expect.objectContaining({ cache: 'reload' }),
    )
    expect(w.get('[data-test="song-notice"]').text()).toBe(
      'Ausschnitt nicht geladen — Play antippen.',
    )
    expect(playbacks[0]!.setSource).not.toHaveBeenCalled()
  })

  it('rings the play button while the clip is on its way, and takes the ring away after', async () => {
    let deliver: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
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

    deliver(sealedClip('clip-0'))
    await flushPromises()

    expect(w.find('[data-test="play-loading"]').exists()).toBe(false)
    expect(w.get('[data-test="play"]').attributes('disabled')).toBeUndefined()
  })

  it('says a clip did not load and makes the play button the retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mountBoard({ stage: 0 })
    await flushPromises()

    // The one control that gets out of this, named — a stage can come free two ways and neither
    // is worth mentioning here.
    expect(w.get('[data-test="song-notice"]').text()).toBe(
      'Ausschnitt nicht geladen — Play antippen.',
    )
    const play = w.get('[data-test="play"]')
    expect(play.attributes('disabled')).toBeUndefined()
    expect(play.attributes('aria-label')).toBe('Ausschnitt erneut laden')

    await play.trigger('click')
    await flushPromises()

    // Loaded and sounding, and the line is gone rather than sitting there stale.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(playbacks[0]!.restart).toHaveBeenCalledTimes(1)
    expect(w.find('[data-test="song-notice"]').exists()).toBe(false)
  })

  it('fetches nothing and offers nothing to press for a round that carries no audio', async () => {
    const w = mountBoard({ assets: null })
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(w.get('[data-test="play"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="play-loading"]').exists()).toBe(false)
  })

  it('does not sound a stage clip that lands after the round resolved', async () => {
    let deliver: (response: Response) => void = () => {}
    const w = mountBoard({ stage: 0 })
    await flushPromises()
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        deliver = resolve
      }),
    )
    await w.setProps({ stage: 1 })

    // The guess landed, the card is gone — and only now does its own fetch come back.
    w.unmount()
    deliver(sealedClip('clip-1'))
    await flushPromises()

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
    // Hits and field first (both the search box's), then the bar, then the transport, then the
    // explanation box — the reveal fills the same rows with the cover and the title, so nothing
    // moves when the round resolves.
    expect(rows).toEqual(['search-stub', 'stage-bar', 'pause', 'info-box', 'give-up'])
  })

  it('says nothing about what a guess costs — the skip outline carries that', () => {
    const one = mountBoard({ awardRule: 'ALL_QUALIFYING' })
    const two = mountBoard({ awardRule: 'CLOSEST_ONLY' })

    expect(one.text()).not.toContain('verbrennt')
    expect(two.text()).not.toContain('verbrennen')
  })

  // The frame belongs to the host now (`rounds/RoundCard.vue` and the lab's game page).
  it('brings no frame of its own', () => {
    const classes = mountBoard({}).classes()

    expect(classes).not.toContain('rounded-xl')
    expect(classes).not.toContain('border')
    expect(classes).not.toContain('border-neutral-200')
    expect(classes).not.toContain('bg-white')
    expect(classes).not.toContain('p-4')
  })

  it('keeps the column spacing the search box and the bar are placed by', () => {
    const classes = mountBoard({}).classes()

    expect(classes).toContain('flex')
    expect(classes).toContain('flex-col')
    expect(classes).toContain('gap-4')
  })

  it('carries both boxes, with the stage rule in phase two', () => {
    const w = mountBoard({ awardRule: 'CLOSEST_ONLY', awardPoints: 5 })

    expect(w.text()).toContain('Winner takes it all: 5 Punkte')
    expect(w.text()).toContain('kürzesten Schnipsel')
    expect(w.text()).toContain('Erkenne den Song')
  })

  // Song-snippet is scored by stage, not by time: `stages > 1` beats time in the backend's
  // PlayService, and the scoreboard sorts by the stage reached. The box must not name a time rule.
  it('never promises a time rule, because this game is scored by stage', () => {
    expect(mountBoard({ awardRule: 'CLOSEST_ONLY', awardPoints: 5 }).text()).not.toContain('Zeit')
  })
})
