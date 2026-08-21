import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SongSnippetGame from '@/games/songsnippet/SongSnippetGame.vue'

vi.mock('@/games/songsnippet/SongSnippetBoard.vue', () => ({
  default: {
    name: 'SongSnippetBoard',
    props: ['durations', 'stage', 'awardRule', 'disabled', 'assetUrl', 'notice'],
    emits: ['guess', 'skip', 'giveUp'],
    template: '<div data-test="board-stub" />',
  },
}))
vi.mock('@/games/songsnippet/SongSnippetReveal.vue', () => ({
  default: {
    name: 'SongSnippetReveal',
    props: ['solution', 'durations', 'rows', 'live', 'assetUrl'],
    template: '<div data-test="reveal-stub" />',
  },
}))

const DURATIONS = [0.1, 0.5, 2, 8, 15]

function mountGame(stage = 0, overrides: Record<string, unknown> = {}) {
  return mount(SongSnippetGame, {
    props: {
      payload: { stageDurationsSeconds: DURATIONS },
      outcome: null,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: null,
      awardRule: null,
      disabled: false,
      stage,
      assetUrl: (key: number) => `/assets/${key}`,
      ...overrides,
    },
  })
}

const SOLUTION = {
  artist: 'Die Atzen',
  title: 'Das geht ab',
  coverUrl: null,
  link: 'https://www.deezer.com/track/702871922',
}

function entry(userId: string, points: number, stage: number) {
  return {
    userId,
    username: userId,
    stage,
    guess: { trackId: 1, artist: 'Eagles', title: 'Hotel California' },
    outcome: { correct: true },
    points,
    avatar: { bgColorHex: '#406abf' },
  }
}

describe('SongSnippetGame', () => {
  it('shows no wrong-guess notice when the stage grows after a skip', async () => {
    const w = mountGame(0)
    const board = w.findComponent({ name: 'SongSnippetBoard' })

    await board.vm.$emit('skip', 0)
    await w.setProps({ stage: 1 })

    expect(w.findComponent({ name: 'SongSnippetBoard' }).props('notice')).toBeNull()
  })

  it('shows the wrong-guess notice when the stage grows without a preceding skip', async () => {
    const w = mountGame(0)

    await w.setProps({ stage: 1 })

    expect(w.findComponent({ name: 'SongSnippetBoard' }).props('notice')).toBe(
      'Falsch — nächste Stufe frei.',
    )
  })

  it('still reports a wrong guess after a skip whose request never landed', async () => {
    // A raced skip 409s: the stage never grows, so the skip's own flag is still standing. It must
    // not swallow the verdict on the guess that follows.
    const w = mountGame(0)
    const board = w.findComponent({ name: 'SongSnippetBoard' })

    await board.vm.$emit('skip', 0)
    await board.vm.$emit('guess', { trackId: 1, artist: 'Eagles', title: 'Hotel California' })
    await w.setProps({ stage: 1 })

    expect(w.findComponent({ name: 'SongSnippetBoard' }).props('notice')).toBe(
      'Falsch — nächste Stufe frei.',
    )
  })

  it('works the scoreboard out for the reveal, ranked and flagged, so the card stays composition', async () => {
    const w = mountGame(4, {
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      entries: [entry('slow', 5, 3), entry('fast', 5, 1), entry('empty', 0, 4)],
    })

    const reveal = w.findComponent({ name: 'SongSnippetReveal' })
    expect(reveal.props('rows').map((row: { userId: string }) => row.userId)).toEqual([
      'fast',
      'slow',
      'empty',
    ])
    expect(reveal.props('rows')[0].timeLabel).toBe('0,5')
    // A positive score under „closest only“ can still be overtaken.
    expect(reveal.props('live')).toBe(true)
  })

  it('calls nothing live once every score is settled', async () => {
    const w = mountGame(4, {
      solution: SOLUTION,
      awardRule: 'ALL_QUALIFYING',
      entries: [entry('a', 1, 0)],
    })

    expect(w.findComponent({ name: 'SongSnippetReveal' }).props('live')).toBe(false)
  })
})
