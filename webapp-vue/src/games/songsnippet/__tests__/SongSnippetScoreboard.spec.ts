import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Mock } from 'vitest'
import type { Ref } from 'vue'
import SongSnippetScoreboard from '@/games/songsnippet/SongSnippetScoreboard.vue'
import type { ScoreRow } from '@/games/songsnippet/scoreboard'
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

/** `playing` is exactly the state the play/pause toggle reads, so the composable is stubbed. */
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

const PREVIEW: TrackPreview = {
  trackId: 920082,
  artist: 'Jackson 5',
  title: 'ABC',
  coverUrl: null,
  link: 'https://www.deezer.com/track/920082',
  previewUrl: 'https://cdnt-preview.dzcdn.net/whatever.mp3',
}

function row(overrides: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: overrides.userId,
    colorHex: '#406abf',
    ink: '#ffffff',
    guessLabel: 'ABC · Jackson 5',
    trackId: 920082,
    correct: false,
    timeLabel: '15,0s',
    stage: 4,
    points: 0,
    provisional: false,
    ...overrides,
  }
}

function mountBoard(rows: ScoreRow[], live = false) {
  return mount(SongSnippetScoreboard, { props: { rows, live } })
}

describe('SongSnippetScoreboard', () => {
  beforeEach(() => {
    resolveTrack.mockReset()
    playbacks.length = 0
  })

  it('renders nothing at all when the round has no entries', () => {
    expect(mountBoard([]).find('[data-test="song-scoreboard"]').exists()).toBe(false)
  })

  it('heads the table like Guess Hue: a title and the four column labels', () => {
    const w = mountBoard([row({ userId: 'a' })])

    expect(w.get('h2').text()).toBe('Auswertung')
    expect(w.findAll('thead th').map((th) => th.text())).toEqual(['Name', 'Tipp', 'Zeit', 'Pkt'])
  })

  it('keeps the order it was handed and paints every row in its player colour', () => {
    const w = mountBoard([
      row({ userId: 'first', colorHex: '#101010', ink: '#ffffff' }),
      row({ userId: 'second' }),
    ])

    const body = w.findAll('tbody tr')
    expect(body.map((tr) => tr.get('th').text())).toEqual(['first', 'second'])
    const style = body[0]!.get('th').attributes('style')
    expect(style).toContain('background-color')
    expect(style).toContain('color')
  })

  it('shows the guess, the time and the score of each row', () => {
    const w = mountBoard([row({ userId: 'a', timeLabel: '2,0s', points: 3 })])

    const cells = w.get('tbody tr').findAll('td')
    expect(w.get('[data-test="guess-label"]').text()).toBe('ABC · Jackson 5')
    expect(cells[1]!.text()).toBe('2,0s')
    expect(cells[2]!.text()).toBe('3')
  })

  it('writes an em dash where a round left the score unset', () => {
    const w = mountBoard([row({ userId: 'a', points: null })])

    expect(w.get('[data-test="song-scoreboard-points"]').text()).toBe('—')
  })

  it('offers playback for every guess that carries a track id, right or wrong', () => {
    const w = mountBoard([
      row({ userId: 'wrong' }),
      row({ userId: 'right', correct: true }),
      row({ userId: 'no-id', trackId: null }),
      row({ userId: 'quitter', trackId: null, guessLabel: '— aufgegeben —' }),
    ])

    const playable = w
      .findAll('tbody tr')
      .filter((tr) => tr.find('[data-test="play-guess"]').exists())
    expect(playable.map((tr) => tr.get('th').text())).toEqual(['wrong', 'right'])
  })

  it('leads with the button and puts the guess behind it', () => {
    const w = mountBoard([row({ userId: 'a' })])

    const cell = w.get('tbody tr').findAll('td')[0]!
    const order = [...cell.element.querySelectorAll('[data-test]')].map((e) =>
      e.getAttribute('data-test'),
    )
    expect(order).toEqual(['play-guess', 'guess-label'])
  })

  it('centres a row that has nothing to play, since it has nothing to line up with', () => {
    const w = mountBoard([
      row({ userId: 'quitter', trackId: null, guessLabel: '— aufgegeben —' }),
      row({ userId: 'guesser' }),
    ])

    const cells = w.findAll('tbody tr').map((tr) => tr.findAll('td')[0]!.get('span'))
    expect(cells[0]!.classes()).toContain('justify-center')
    expect(cells[1]!.classes()).not.toContain('justify-center')
  })

  it("resolves a wrong guess's track and plays it from Deezer", async () => {
    resolveTrack.mockResolvedValue(PREVIEW)
    const w = mountBoard([row({ userId: 'wrong' })])

    await w.get('[data-test="play-guess"]').trigger('click')
    await Promise.resolve()

    expect(resolveTrack).toHaveBeenCalledWith(920082)
    expect(playbacks[0]!.setSource).toHaveBeenCalledWith(PREVIEW.previewUrl)
    expect(playbacks[0]!.restart).toHaveBeenCalled()
  })

  it('turns the same button into pause while that guess sounds, and pauses on the next tap', async () => {
    resolveTrack.mockResolvedValue(PREVIEW)
    const w = mountBoard([row({ userId: 'wrong' })])
    const button = w.get('[data-test="play-guess"]')
    expect(button.attributes('aria-label')).toBe('Tipp anhören')

    await button.trigger('click')
    await Promise.resolve()
    // What the `play` event would report on a real element.
    playbacks[0]!.playing.value = true
    await w.vm.$nextTick()
    expect(button.attributes('aria-label')).toBe('Pause')

    await button.trigger('click')
    expect(playbacks[0]!.pause).toHaveBeenCalled()
    expect(resolveTrack).toHaveBeenCalledTimes(1)
  })

  it('marks a provisional score and carries the live chip when told to', () => {
    const provisional = mountBoard([row({ userId: 'a', points: 5, provisional: true })], true)
    expect(provisional.get('[data-test="song-scoreboard-live"]').text()).toContain('live')
    expect(provisional.get('[data-test="song-scoreboard-points"]').classes()).toContain('italic')

    const settled = mountBoard([row({ userId: 'a', points: 5 })], false)
    expect(settled.find('[data-test="song-scoreboard-live"]').exists()).toBe(false)
    expect(settled.get('[data-test="song-scoreboard-points"]').classes()).not.toContain('italic')
  })
})
