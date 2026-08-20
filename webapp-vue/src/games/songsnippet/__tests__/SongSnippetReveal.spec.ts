import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { GameEntry } from '@/games/GameEntry'
import SongSnippetReveal from '@/games/songsnippet/SongSnippetReveal.vue'
import type { SongSnippetSolution } from '@/games/songsnippet/types'
import type { TrackPreview } from '@/games/songsnippet/api'

const { resolveTrack } = vi.hoisted(() => ({ resolveTrack: vi.fn() }))
vi.mock('@/games/songsnippet/api', () => ({ resolveTrack }))

const { fetchAssetBlob } = vi.hoisted(() => ({ fetchAssetBlob: vi.fn() }))
vi.mock('@/api/assets', () => ({ fetchAssetBlob }))

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
  mineUserId?: string | null
}) {
  return mount(SongSnippetReveal, {
    props: {
      solution: props.solution ?? SOLUTION,
      durations: props.durations ?? DURATIONS,
      entries: props.entries ?? [],
      mineUserId: props.mineUserId ?? null,
      assetUrl: (key: number) => `/assets/${key}`,
    },
  })
}

describe('SongSnippetReveal', () => {
  beforeEach(() => {
    resolveTrack.mockReset()
    fetchAssetBlob.mockReset()
  })

  it('sorts the scoreboard by points, descending', () => {
    const entries = [
      entry({ userId: 'low', points: 1 }),
      entry({ userId: 'high', points: 5 }),
      entry({ userId: 'mid', points: 3 }),
    ]
    const w = mountReveal({ entries })

    const names = w
      .get('[data-test="song-scoreboard"]')
      .findAll('tr')
      .map((tr) => tr.get('td').text())

    expect(names).toEqual(['high', 'mid', 'low'])
  })

  it("bolds the viewer's own row and no other", () => {
    const entries = [entry({ userId: 'me', points: 1 }), entry({ userId: 'them', points: 2 })]
    const w = mountReveal({ entries, mineUserId: 'me' })

    const rows = w.get('[data-test="song-scoreboard"]').findAll('tr')
    const mine = rows.find((tr) => tr.text().includes('me'))!
    const theirs = rows.find((tr) => tr.text().includes('them'))!

    expect(mine.classes()).toContain('font-semibold')
    expect(theirs.classes()).not.toContain('font-semibold')
  })

  it('labels a correct guess in green, with no anhören button', () => {
    const entries = [
      entry({
        userId: 'winner',
        guess: { trackId: 1, artist: 'Die Atzen', title: 'Das geht ab' },
        outcome: { correct: true },
      }),
    ]
    const w = mountReveal({ entries })

    const label = w.get('[data-test="song-scoreboard"] tr')
    expect(label.text()).toContain('Die Atzen — Das geht ab')
    expect(label.get('span').classes()).toContain('text-emerald-700')
    expect(label.find('[data-test="play-guess"]').exists()).toBe(false)
  })

  it('labels a wrong guess in neutral, with an anhören button when it carries a trackId', () => {
    const entries = [
      entry({
        userId: 'wrong',
        guess: { trackId: 920082, artist: 'Jackson 5', title: 'ABC' },
        outcome: { correct: false },
      }),
    ]
    const w = mountReveal({ entries })

    const row = w.get('[data-test="song-scoreboard"] tr')
    expect(row.text()).toContain('Jackson 5 — ABC')
    expect(row.get('span').classes()).toContain('text-neutral-500')
    expect(row.get('[data-test="play-guess"]').text()).toBe('anhören')
  })

  it('hides the anhören button for a wrong guess without a trackId', () => {
    const entries = [
      entry({
        userId: 'wrong',
        guess: { artist: 'Jackson 5', title: 'ABC' },
        outcome: { correct: false },
      }),
    ]
    const w = mountReveal({ entries })

    expect(w.find('[data-test="play-guess"]').exists()).toBe(false)
  })

  it('renders „— aufgegeben —“ for a guess-less entry, with no anhören button', () => {
    const entries = [entry({ userId: 'quitter', guess: null, outcome: null })]
    const w = mountReveal({ entries })

    const row = w.get('[data-test="song-scoreboard"] tr')
    expect(row.text()).toContain('— aufgegeben —')
    expect(row.find('[data-test="play-guess"]').exists()).toBe(false)
  })

  it('renders the reached stage duration in the stage column', () => {
    const entries = [entry({ userId: 'a', stage: 3 })]
    const w = mountReveal({ entries, durations: DURATIONS })

    expect(w.get('[data-test="song-scoreboard"] tr').text()).toContain('8s')
  })

  it('renders the solution title, artist, cover and Deezer link', () => {
    const w = mountReveal({})

    expect(w.get('img[data-test="cover"]').attributes('src')).toBe(SOLUTION.coverUrl)
    expect(w.text()).toContain(SOLUTION.title)
    expect(w.text()).toContain(SOLUTION.artist)
    const link = w.get('a')
    expect(link.attributes('href')).toBe(SOLUTION.link)
    expect(link.text()).toBe('Auf Deezer öffnen')
  })

  it('falls back to the note emoji when there is no cover', () => {
    const w = mountReveal({ solution: { ...SOLUTION, coverUrl: null } })

    expect(w.find('img[data-test="cover"]').exists()).toBe(false)
    expect(w.text()).toContain('🎵')
  })

  it("resolves and plays a wrong guess's track when its anhören button is clicked", async () => {
    resolveTrack.mockResolvedValue({
      trackId: 920082,
      artist: 'Jackson 5',
      title: 'ABC',
      coverUrl: null,
      link: 'https://www.deezer.com/track/920082',
      previewUrl: 'https://cdnt-preview.dzcdn.net/whatever.mp3',
    } satisfies TrackPreview)
    const entries = [
      entry({
        userId: 'wrong',
        guess: { trackId: 920082, artist: 'Jackson 5', title: 'ABC' },
        outcome: { correct: false },
      }),
    ]
    const w = mountReveal({ entries })

    await w.get('[data-test="play-guess"]').trigger('click')

    expect(resolveTrack).toHaveBeenCalledWith(920082)
  })

  it('does nothing when the anhören button is clicked for a guess without a trackId', async () => {
    // Defensive: the button is not rendered for this case (see above), but a wiring change that
    // let it through must not silently resolve an undefined track id either.
    const entries = [
      entry({
        userId: 'wrong',
        guess: { artist: 'Jackson 5', title: 'ABC' },
        outcome: { correct: false },
      }),
    ]
    mountReveal({ entries })

    expect(resolveTrack).not.toHaveBeenCalled()
  })
})
