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
  default: { name: 'SongSnippetReveal', template: '<div data-test="reveal-stub" />' },
}))

const DURATIONS = [0.1, 0.5, 2, 8, 15]

function mountGame(stage = 0) {
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
    },
  })
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
})
