import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternBoard from '@/games/findpattern/FindPatternBoard.vue'
import FindPatternGame from '@/games/findpattern/FindPatternGame.vue'
import type { GameEntry } from '@/games/GameEntry'

const PAYLOAD = {
  cols: 8,
  rows: 14,
  patternLength: 4,
  boardImage: 'data:image/png;base64,AAA',
  patternImage: 'data:image/png;base64,BBB',
}

const SOLUTION = {
  blocks: Array.from({ length: 112 }, (_, index) => index % 4),
  pattern: [1, 2, 3, 0],
  palette: ['#ffffff', '#cccccc', '#999999', '#666666'],
  delta: 0.14,
  startIndices: [1, 5],
}

const MINE: GameEntry = {
  userId: 'mine',
  username: 'Leela',
  stage: 0,
  guess: { startIndex: 5 },
  outcome: { correct: true },
  points: 1,
  durationMs: 42_000,
  avatar: { bgColorHex: '#7c3aed' },
}

const OTHER: GameEntry = {
  userId: 'other',
  username: 'Fry',
  stage: 0,
  guess: { startIndex: 1 },
  outcome: { correct: false },
  points: 0,
  durationMs: 50_000,
  avatar: { bgColorHex: '#16a34a' },
}

function mountGame(over: Record<string, unknown> = {}) {
  return mount(FindPatternGame, {
    props: {
      payload: PAYLOAD,
      outcome: null,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: null,
      awardRule: 'ALL_QUALIFYING',
      disabled: false,
      ...over,
    },
  })
}

describe('FindPatternGame', () => {
  it('plays while there is no solution', () => {
    const wrapper = mountGame()

    expect(wrapper.find('[data-test="pattern-board"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="pattern-reveal"]').exists()).toBe(false)
  })

  it('marks the board in my own colour, taken from the entries', () => {
    // `FindPatternBoard` only draws the colour into an outline once a cell is selected — checking
    // the wired-through prop, rather than the initial (empty) selection's HTML, is what makes this
    // test about the colour lookup instead of about clicking first.
    const wrapper = mountGame({ entries: [{ ...MINE, guess: null }], mineUserId: 'mine' })

    expect(wrapper.getComponent(FindPatternBoard).props('myColorHex')).toBe('#7c3aed')
  })

  it('passes a guess up unchanged', async () => {
    const wrapper = mountGame()

    for (const index of [10, 11, 12, 13]) {
      await wrapper.get(`[data-test="pattern-cell-${index}"]`).trigger('click')
    }

    expect(wrapper.emitted('guess')).toEqual([[{ startIndex: 10 }]])
  })

  it('reveals once the server sends a solution', () => {
    const wrapper = mountGame({ solution: SOLUTION, entries: [MINE], mineUserId: 'mine' })

    expect(wrapper.find('[data-test="pattern-reveal"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="pattern-board"]').exists()).toBe(false)
  })

  it('keeps playing on a junk payload rather than rendering NaN', () => {
    const wrapper = mountGame({ payload: { cols: 'eight' } })

    expect(wrapper.find('[data-test="pattern-board"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="pattern-reveal"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('nicht anzeigen')
  })

  it('stays on the board when the solution is junk', () => {
    const wrapper = mountGame({ solution: { blocks: 'nope' }, entries: [MINE], mineUserId: 'mine' })

    expect(wrapper.find('[data-test="pattern-board"]').exists()).toBe(true)
  })

  it('passes my already-submitted guess down as a start index', () => {
    const wrapper = mountGame({ myGuess: { startIndex: 5 }, disabled: true })

    expect(wrapper.getComponent(FindPatternBoard).props('submittedStartIndex')).toBe(5)
  })

  it.each([[{ startIndex: 4.5 }], [null], ['nope'], [{ startIndex: '5' }]])(
    'turns a junk guess %j into null rather than drawing anything',
    (myGuess) => {
      const wrapper = mountGame({ myGuess, disabled: true })

      expect(wrapper.getComponent(FindPatternBoard).props('submittedStartIndex')).toBeNull()
      expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(0)
    },
  )
})

describe('FindPatternGame, the live-reveal transition', () => {
  // Fake frames only, like GuessHueGame's equivalent describe: `useRevealArming`'s `shown` must
  // stay pinned to its initial value so the opacity assertions below test the `animate` prop
  // itself, not whichever way a real `requestAnimationFrame` happened to settle in this runner.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not replay the reveal for someone reloading a spent round', () => {
    // Mounted straight into an already-revealed round: there was no live transition to animate,
    // so the other player's outline must be fully drawn from the first render, not staged.
    const wrapper = mountGame({ solution: SOLUTION, entries: [MINE, OTHER], mineUserId: 'mine' })

    expect(wrapper.get('[data-test="pattern-outline-1"]').classes()).toContain('opacity-100')
  })

  it('plays the reveal for the guess that just landed', async () => {
    // The same instance watches the round flip from playing to revealed while mounted: the other
    // player's outline is staged behind its own delay, exactly as `FindPatternReveal` stages a
    // live cascade.
    const wrapper = mountGame()

    await wrapper.setProps({ solution: SOLUTION, entries: [MINE, OTHER], mineUserId: 'mine' })

    expect(wrapper.get('[data-test="pattern-outline-1"]').classes()).toContain('opacity-0')
  })
})
