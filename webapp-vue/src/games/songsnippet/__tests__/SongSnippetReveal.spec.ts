import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Mock } from 'vitest'
import type { Ref } from 'vue'
import type { GameEntry } from '@/games/GameEntry'
import SongSnippetReveal from '@/games/songsnippet/SongSnippetReveal.vue'
import type { SongSnippetSolution } from '@/games/songsnippet/types'
import type { TrackPreview } from '@/games/songsnippet/api'

interface PlaybackStub {
  positionSeconds: Ref<number>
  playing: Ref<boolean>
  setSource: Mock
  restart: Mock
  pause: Mock
  dispose: Mock
}

const { resolveTrack } = vi.hoisted(() => ({ resolveTrack: vi.fn() }))
vi.mock('@/games/songsnippet/api', () => ({ resolveTrack }))

const { fetchAssetBlob } = vi.hoisted(() => ({ fetchAssetBlob: vi.fn() }))
vi.mock('@/api/assets', () => ({ fetchAssetBlob }))

/**
 * The real composable owns an `Audio` element happy-dom cannot sound, and `playing` is exactly the
 * state the play/pause toggle reads — so it is stubbed, and the stubs are collected in call order:
 * `[0]` is the solution player the component creates first, `[1]` the one for guesses.
 */
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

function entry(overrides: Partial<GameEntry> & { userId: string }): GameEntry {
  return {
    username: overrides.userId,
    stage: 0,
    guess: null,
    outcome: null,
    points: 0,
    avatar: { bgColorHex: '#406abf' },
    ...overrides,
  }
}

function mountReveal(props: {
  solution?: SongSnippetSolution
  durations?: number[]
  entries?: GameEntry[]
  awardRule?: 'ALL_QUALIFYING' | 'CLOSEST_ONLY' | null
}) {
  return mount(SongSnippetReveal, {
    props: {
      solution: props.solution ?? SOLUTION,
      durations: props.durations ?? DURATIONS,
      entries: props.entries ?? [],
      awardRule: props.awardRule ?? null,
      assetUrl: (key: number) => `/assets/${key}`,
    },
  })
}

const wrongGuess = (userId: string, trackId: number | null = 920082) =>
  entry({
    userId,
    guess:
      trackId === null
        ? { artist: 'Jackson 5', title: 'ABC' }
        : { trackId, artist: 'Jackson 5', title: 'ABC' },
    outcome: { correct: false },
  })

describe('SongSnippetReveal', () => {
  beforeEach(() => {
    resolveTrack.mockReset()
    fetchAssetBlob.mockReset()
    playbacks.length = 0
    URL.createObjectURL = vi.fn(() => 'blob:solution')
    URL.revokeObjectURL = vi.fn()
  })

  it('puts the Deezer link on the cover itself, opening in a new tab', () => {
    const w = mountReveal({})

    const link = w.get('[data-test="deezer-link"]')
    expect(link.attributes('href')).toBe(SOLUTION.link)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.get('img[data-test="cover"]').attributes('src')).toBe(SOLUTION.coverUrl)
  })

  it('falls back to the note emoji when there is no cover, keeping the link', () => {
    const w = mountReveal({ solution: { ...SOLUTION, coverUrl: null } })

    expect(w.find('img[data-test="cover"]').exists()).toBe(false)
    expect(w.get('[data-test="deezer-link"]').text()).toContain('🎵')
  })

  it('names the song on one line, title and artist split by a middle dot', () => {
    const w = mountReveal({})

    expect(w.get('[data-test="solution-line"]').text()).toBe('Das geht ab · Die Atzen')
  })

  it('heads the scoreboard like Guess Hue: a title and the four column labels', () => {
    const w = mountReveal({ entries: [entry({ userId: 'a' })] })

    const table = w.get('[data-test="song-scoreboard"]')
    expect(table.get('h2').text()).toBe('Auswertung')
    expect(table.findAll('thead th').map((th) => th.text())).toEqual([
      'Name',
      'Tipp',
      'Zeit',
      'Pkt',
    ])
  })

  it('ranks the rows and paints each one in its player colour', () => {
    const entries = [
      entry({ userId: 'low', points: 1 }),
      entry({ userId: 'high', points: 5 }),
      entry({ userId: 'mid', points: 3 }),
    ]
    const w = mountReveal({ entries })

    const rows = w.get('[data-test="song-scoreboard"]').findAll('tbody tr')
    expect(rows.map((tr) => tr.get('th').text())).toEqual(['high', 'mid', 'low'])
    expect(rows[0]!.get('th').attributes('style')).toContain('background-color')
  })

  it('offers playback for a wrong guess that carries a track id, and for nothing else', () => {
    const entries = [
      wrongGuess('wrong'),
      entry({ userId: 'right', guess: { trackId: 1 }, outcome: { correct: true } }),
      wrongGuess('no-id', null),
      entry({ userId: 'quitter', guess: null }),
    ]
    const w = mountReveal({ entries })

    const rows = w.get('[data-test="song-scoreboard"]').findAll('tbody tr')
    const playable = rows.filter((tr) => tr.find('[data-test="play-guess"]').exists())
    expect(playable).toHaveLength(1)
    expect(playable[0]!.get('th').text()).toBe('wrong')
  })

  it("resolves a wrong guess's track and plays it from Deezer", async () => {
    resolveTrack.mockResolvedValue({
      trackId: 920082,
      artist: 'Jackson 5',
      title: 'ABC',
      coverUrl: null,
      link: 'https://www.deezer.com/track/920082',
      previewUrl: 'https://cdnt-preview.dzcdn.net/whatever.mp3',
    } satisfies TrackPreview)
    const w = mountReveal({ entries: [wrongGuess('wrong')] })

    await w.get('[data-test="play-guess"]').trigger('click')
    await Promise.resolve()

    expect(resolveTrack).toHaveBeenCalledWith(920082)
    const guessPlayer = playbacks[1]!
    expect(guessPlayer.setSource).toHaveBeenCalledWith(
      'https://cdnt-preview.dzcdn.net/whatever.mp3',
    )
    expect(guessPlayer.restart).toHaveBeenCalled()
  })

  it('turns the same button into pause while that guess sounds, and pauses on the next tap', async () => {
    resolveTrack.mockResolvedValue({
      trackId: 920082,
      artist: 'Jackson 5',
      title: 'ABC',
      coverUrl: null,
      link: 'https://www.deezer.com/track/920082',
      previewUrl: 'https://cdnt-preview.dzcdn.net/whatever.mp3',
    } satisfies TrackPreview)
    const w = mountReveal({ entries: [wrongGuess('wrong')] })
    const button = w.get('[data-test="play-guess"]')
    expect(button.attributes('aria-label')).toBe('Tipp anhören')

    await button.trigger('click')
    await Promise.resolve()
    // What the `play` event would report on a real element.
    playbacks[1]!.playing.value = true
    await w.vm.$nextTick()

    expect(button.attributes('aria-label')).toBe('Pause')

    await button.trigger('click')
    expect(playbacks[1]!.pause).toHaveBeenCalled()
    expect(resolveTrack).toHaveBeenCalledTimes(1)
  })

  it('loads the solution clip on the first tap only, then replays it', async () => {
    fetchAssetBlob.mockResolvedValue(new Blob(['x']))
    const w = mountReveal({})

    await w.get('[data-test="play-solution"]').trigger('click')
    await Promise.resolve()
    await w.get('[data-test="play-solution"]').trigger('click')
    await Promise.resolve()

    expect(fetchAssetBlob).toHaveBeenCalledExactlyOnceWith('/assets/99')
    expect(playbacks[0]!.restart).toHaveBeenCalledTimes(2)
  })

  it('flags points as live only while the closest guess alone is paid', () => {
    const entries = [entry({ userId: 'a', points: 5 })]

    expect(
      mountReveal({ entries, awardRule: 'CLOSEST_ONLY' })
        .find('[data-test="song-scoreboard-live"]')
        .exists(),
    ).toBe(true)
    expect(
      mountReveal({ entries, awardRule: 'ALL_QUALIFYING' })
        .find('[data-test="song-scoreboard-live"]')
        .exists(),
    ).toBe(false)
  })
})
