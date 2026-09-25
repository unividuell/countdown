import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternBoard from '@/games/findpattern/FindPatternBoard.vue'
import FindPatternBriefing from '@/games/findpattern/FindPatternBriefing.vue'
import FindPatternGame from '@/games/findpattern/FindPatternGame.vue'
import type { GameEntry } from '@/games/GameEntry'
import RevealCover from '@/ui/RevealCover.vue'

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
  votes: [],
  struck: false,
  adminOverride: null,
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
  votes: [],
  struck: false,
  adminOverride: null,
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
      awardPoints: 1,
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

  /**
   * Both cards share one grid cell so the board image stays put while everything under it is
   * exchanged — lose it on either side and the two stack vertically, which moves the board.
   */
  it('keeps both cards in the crossfade’s shared grid cell', () => {
    const playing = mountGame()
    const revealed = mountGame({ solution: SOLUTION, entries: [MINE], mineUserId: 'mine' })

    expect(playing.get('[data-test="pattern-board"]').classes()).toContain('[grid-area:1/1]')
    expect(revealed.get('[data-test="pattern-reveal"]').classes()).toContain('[grid-area:1/1]')
  })

  /**
   * No `mode`, so the cards overlap: with `out-in` the board would be gone before the reveal
   * arrived, and the picture the whole swap rests on staying put would blink away.
   */
  it('crossfades the two cards rather than sequencing them', () => {
    const stub = mountGame().get('transition-stub')

    expect(stub.attributes('mode')).toBeUndefined()
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

const SCENE = { cols: 8, rows: 14, patternLength: 4 }

describe('sealed', () => {
  const sealed = (over: Record<string, unknown> = {}) =>
    mountGame({ payload: null, sealed: true, scene: SCENE, ...over })

  it('sets up the empty board under the cover instead of refusing the round', () => {
    const w = sealed()

    expect(w.text()).not.toContain('Diese Runde lässt sich hier nicht anzeigen.')
    expect(w.find('[data-test="pattern-grid-placeholder"]').exists()).toBe(true)
    expect(w.find('[data-test="pattern-image-placeholder"]').exists()).toBe(true)
    expect(w.find('[data-test="reveal-cover"]').exists()).toBe(true)
  })

  it('makes the play area inert and leaves the rules outside the cover', () => {
    const w = sealed()
    const play = w.get('[data-test="pattern-play"]')
    const rules = w.getComponent(FindPatternBriefing).element

    expect(play.attributes('inert')).toBeDefined()
    expect(rules.closest('[inert]')).toBeNull()
    expect(rules.closest('[data-test="reveal-cover"]')).toBeNull()
  })

  it('reports the scene as ready at once — there is nothing to load', () => {
    expect(sealed().getComponent(RevealCover).props('state')).toBe('ready')
  })

  it('asks for the reveal when the cover starts', () => {
    const w = sealed()

    w.getComponent(RevealCover).vm.$emit('start')

    expect(w.emitted('reveal')).toHaveLength(1)
  })

  it('passes the card busy on to the cover', () => {
    expect(sealed({ disabled: true }).getComponent(RevealCover).props('busy')).toBe(true)
  })

  it('drops the cover in the same render the payload arrives in', async () => {
    const w = sealed()

    await w.setProps({ sealed: false, payload: PAYLOAD })

    expect(w.find('[data-test="reveal-cover"]').exists()).toBe(false)
    expect(w.find('[data-test="pattern-grid-placeholder"]').exists()).toBe(false)
    expect(w.get('[data-test="pattern-play"]').attributes('inert')).toBeUndefined()
  })

  it('still refuses a sealed round whose scene it cannot read', () => {
    expect(sealed({ scene: { cols: 'x' } }).text()).toContain(
      'Diese Runde lässt sich hier nicht anzeigen.',
    )
  })
})
