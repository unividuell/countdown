import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Mock } from 'vitest'
import type { Ref } from 'vue'
import SongPlayerReveal from '@/games/songsnippet/SongPlayerReveal.vue'
import type { SongSnippetSolution } from '@/games/songsnippet/types'

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

/** The real composable owns an `Audio` element happy-dom cannot sound. */
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

const DURATIONS = [0.1, 0.5, 2, 8, 15]

const SOLUTION: SongSnippetSolution = {
  artist: 'Die Atzen',
  title: 'Das geht ab',
  coverUrl: 'https://example.test/cover.jpg',
  link: 'https://www.deezer.com/track/702871922',
}

function mountPlayer(solution: SongSnippetSolution = SOLUTION) {
  return mount(SongPlayerReveal, {
    props: { solution, durations: DURATIONS, assetUrl: (key: number) => `/assets/${key}` },
  })
}

describe('SongPlayerReveal', () => {
  beforeEach(() => {
    fetchAssetBlob.mockReset()
    playbacks.length = 0
    URL.createObjectURL = vi.fn(() => 'blob:solution')
    URL.revokeObjectURL = vi.fn()
  })

  it('puts the Deezer link on the cover itself, opening in a new tab', () => {
    const w = mountPlayer()

    const link = w.get('[data-test="deezer-link"]')
    expect(link.attributes('href')).toBe(SOLUTION.link)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.get('img[data-test="cover"]').attributes('src')).toBe(SOLUTION.coverUrl)
  })

  it('falls back to the note emoji when there is no cover, keeping the link', () => {
    const w = mountPlayer({ ...SOLUTION, coverUrl: null })

    expect(w.find('img[data-test="cover"]').exists()).toBe(false)
    expect(w.get('[data-test="deezer-link"]').text()).toContain('🎵')
  })

  it('fetches the solution once however often it is tapped, and lets go of nothing twice', async () => {
    let deliver: (blob: Blob) => void = () => {}
    fetchAssetBlob.mockReturnValue(
      new Promise<Blob>((resolve) => {
        deliver = resolve
      }),
    )
    const w = mountPlayer()

    // Two impatient taps while the 30s solution is still on the wire.
    await w.get('[data-test="play-solution"]').trigger('click')
    await w.get('[data-test="play-solution"]').trigger('click')
    deliver(new Blob(['x']))
    await Promise.resolve()
    await w.vm.$nextTick()

    expect(fetchAssetBlob).toHaveBeenCalledTimes(1)
    // One object URL, so the one `onUnmounted` revokes is the only one there ever was.
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('takes the cover and the title from the board, so the round resolves without a jump', () => {
    const w = mountPlayer()

    // The band's covers carry the same class, and the board's search field the same slot height.
    expect(w.get('[data-test="deezer-link"]').classes()).toContain('song-cover')
    expect(w.get('[data-test="deezer-link"]').classes()).toContain('aspect-square')
    expect(w.get('[data-test="solution-line"]').classes()).toContain('h-12')
  })

  it('names the song on two lines, since either of them can be long', () => {
    const lines = mountPlayer()
      .get('[data-test="solution-line"]')
      .findAll('p')
      .map((p) => p.text())

    expect(lines).toEqual(['Das geht ab', 'Die Atzen'])
  })

  it('loads the solution clip on the first tap only, then replays it', async () => {
    fetchAssetBlob.mockResolvedValue(new Blob(['x']))
    const w = mountPlayer()

    await w.get('[data-test="play-solution"]').trigger('click')
    await Promise.resolve()
    await w.get('[data-test="play-solution"]').trigger('click')
    await Promise.resolve()

    expect(fetchAssetBlob).toHaveBeenCalledExactlyOnceWith('/assets/99')
    expect(playbacks[0]!.setSource).toHaveBeenCalledExactlyOnceWith('blob:solution')
    expect(playbacks[0]!.restart).toHaveBeenCalledTimes(2)
  })

  it('pauses through its own smaller button', async () => {
    const w = mountPlayer()

    await w.get('[data-test="pause-solution"]').trigger('click')

    expect(playbacks[0]!.pause).toHaveBeenCalled()
  })
})
