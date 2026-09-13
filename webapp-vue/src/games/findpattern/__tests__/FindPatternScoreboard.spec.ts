import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternScoreboard from '@/games/findpattern/FindPatternScoreboard.vue'
import type { ScoreRow } from '@/games/findpattern/scoreboard'

// The table itself — band, gutters, cascade, live chip, the pulse's nesting — is
// `RevealScoreboard`'s and tested there. What is Musterung's own: the chip columns, the clock that
// only a timed round shows, and the give-up row.

const CHIPS = [
  { value: 1, hex: '#cccccc', ink: '#111111' },
  { value: 2, hex: '#999999', ink: '#ffffff' },
  { value: 3, hex: '#666666', ink: '#ffffff' },
  { value: 0, hex: '#ffffff', ink: '#111111' },
]

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    chips: CHIPS,
    correct: true,
    gaveUp: false,
    durationLabel: null,
    points: 1,
    provisional: false,
    startIndex: 5,
    tick: 0,
    ...over,
  }
}

function mountBoard(props: Partial<InstanceType<typeof FindPatternScoreboard>['$props']> = {}) {
  return mount(FindPatternScoreboard, {
    props: {
      rows: [row({ userId: 'a' })],
      solutionChips: CHIPS,
      live: false,
      animate: false,
      ...props,
    },
  })
}

describe('FindPatternScoreboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the solution and one row per player', () => {
    const wrapper = mountBoard({
      rows: [row({ userId: 'a' }), row({ userId: 'b', points: 0, correct: false })],
    })

    expect(wrapper.findAll('[data-test="solution-chip"]')).toHaveLength(4)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('anchors the solution over the tip column, timed or not', () => {
    // `headers` is the link that pins the solution to one column — and the clock column, which
    // only some rounds carry, must not be able to slide it anywhere else.
    for (const rows of [[row({ userId: 'a' })], [row({ userId: 'a', durationLabel: '00:42' })]]) {
      const wrapper = mountBoard({ rows })
      const solution = wrapper.get('[data-test="solution-chip"]').element.closest('td')!

      expect(solution.getAttribute('headers')).toBe('tip-solution')
      expect(wrapper.get('#tip-solution').text()).toBe('Lösung')
    }
  })

  it('keeps the pattern tight: the chips carry the cell, not the table', () => {
    // The chips are a pattern, not a row of table cells. A ground or a padding on the cell would
    // inset them from its edge and break the run.
    const wrapper = mountBoard()
    const tip = wrapper.get<HTMLElement>('[data-test="tip-a"]').element.closest('td')!

    expect(tip.style.backgroundColor).toBe('')
    expect(tip.className).not.toContain('px-')
  })

  it('sizes the tip column to exactly the chips it holds, not a fixed guess', () => {
    const wrapper = mountBoard({ solutionChips: CHIPS })

    const tipCol = wrapper.findAll('col')[1]

    expect(tipCol?.attributes('style')).toContain('width: calc(4 * 1.5rem + 3 * 1px)')
  })

  it('follows the pattern length wherever it goes, not a hardcoded four', () => {
    const wrapper = mountBoard({ solutionChips: CHIPS.slice(0, 3) })

    const tipCol = wrapper.findAll('col')[1]

    expect(tipCol?.attributes('style')).toContain('width: calc(3 * 1.5rem + 2 * 1px)')
  })

  it('prints every tone index, so the palette can be read against it', () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a' })] })

    expect(wrapper.get('[data-test="tip-a"]').text()).toBe('1230')
  })

  it('leaves the clock column out of a round that was not timed', () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a' })] })

    expect(wrapper.text()).not.toContain('[mm:ss]')
  })

  it('shows the clock column as soon as a row has a duration', () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a', durationLabel: '00:42' })] })

    expect(wrapper.text()).toContain('[mm:ss]')
    expect(wrapper.text()).toContain('00:42')
  })

  it('says so when somebody gave up instead of printing four empty chips', () => {
    const wrapper = mountBoard({
      rows: [row({ userId: 'a', gaveUp: true, chips: [], correct: false, points: 0 })],
    })

    expect(wrapper.get('[data-test="tip-a"]').text()).toContain('aufgegeben')
  })
})
