import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GuessHueScoreboard from '@/games/guesshue/GuessHueScoreboard.vue'
import type { ScoreboardRow, ScoreboardSolution } from '@/games/guesshue/scoreboard'

// The table itself — band, gutters, cascade, live chip, the pulse's nesting — is
// `RevealScoreboard`'s and tested there. What is guess-hue's own: which columns it asks for, the
// German numbers in them, and the guess cell carrying a colour of its own.

const SOLUTION: ScoreboardSolution = { hue: 123.4, hex: '#5ce65c', ink: '#111111' }

function row(over: Partial<ScoreboardRow> & { userId: string }): ScoreboardRow {
  return {
    name: over.userId,
    colorHex: '#7d2ae8',
    ink: '#ffffff',
    hue: 128.4,
    guessHex: '#5ce65c',
    guessInk: '#111111',
    deviationDeg: 5,
    points: 1,
    provisional: false,
    tick: 0,
    ...over,
  }
}

function mountBoard(props: Partial<InstanceType<typeof GuessHueScoreboard>['$props']> = {}) {
  return mount(GuessHueScoreboard, {
    props: {
      rows: [row({ userId: 'leela' })],
      solution: SOLUTION,
      live: false,
      animate: false,
      ...props,
    },
  })
}

describe('GuessHueScoreboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('asks for a guess column and a distance column, in that order', () => {
    const band = mountBoard().findAll('thead tr:last-child th')

    expect(band.map((cell) => cell.text())).toEqual(['Name', 'Tipp', 'Differenz', 'Pkt'])
  })

  it('anchors the solution over the guess column, not over the distance', () => {
    // `headers`, not `scope`: „Lösung“ heads only this one cell, while the column below it is
    // „Tipp“. The link is also what pins the solution to the guess column rather than any other.
    const w = mountBoard()
    const solution = w.get('[data-test="hue-scoreboard-solution"]').element.closest('td')!

    expect(solution.getAttribute('headers')).toBe('tip-solution')
    expect(w.get('#tip-solution').text()).toBe('Lösung')
  })

  it('paints the solution in the colour it stands for', () => {
    const w = mountBoard({ solution: { hue: 123.4, hex: '#5ce65c', ink: '#111111' } })
    const solution = w.get<HTMLElement>('[data-test="hue-scoreboard-solution"]')

    expect(solution.element.style.backgroundColor).toMatch(/#5ce65c|rgb\(92, ?230, ?92\)/i)
    expect(solution.text()).toBe('123,4')
  })

  it('says in the caption what the heading does not', () => {
    const caption = mountBoard().get('caption')

    expect(caption.classes()).toContain('sr-only')
    expect(caption.text()).not.toContain('Auswertung')
    expect(caption.text()).toContain('sortiert')
  })

  it('grounds the row in the player colour and the guess cell in the guess colour', () => {
    const w = mountBoard({
      rows: [
        row({
          userId: 'leela',
          colorHex: '#7d2ae8',
          ink: '#ffffff',
          guessHex: '#5ce65c',
          guessInk: '#111111',
        }),
      ],
    })
    const cells = w.findAll<HTMLElement>('tbody th, tbody td')

    // happy-dom may or may not normalise a hex to rgb() — the test pins the colour, not that.
    expect(cells[0]!.element.style.backgroundColor).toMatch(/#7d2ae8|rgb\(125, ?42, ?232\)/i)
    expect(cells[1]!.element.style.backgroundColor).toMatch(/#5ce65c|rgb\(92, ?230, ?92\)/i)
    expect(cells[2]!.element.style.backgroundColor).toMatch(/#7d2ae8|rgb\(125, ?42, ?232\)/i)
    expect(cells[3]!.element.style.backgroundColor).toMatch(/#7d2ae8|rgb\(125, ?42, ?232\)/i)
  })

  it('writes the numbers German, with one decimal and an em dash for nothing', () => {
    const w = mountBoard({
      rows: [row({ userId: 'a', hue: 128.4, deviationDeg: 5, points: null })],
    })
    const cells = w.findAll('tbody td')

    expect(cells[0]!.text()).toBe('128,4')
    expect(cells[1]!.text()).toBe('5,0')
    // U+2014, not a hyphen and not an en dash.
    expect(cells[2]!.text()).toBe('—')
  })

  it('renders nothing at all when no guess could be ranked', () => {
    const w = mountBoard({ rows: [] })

    expect(w.find('table').exists()).toBe(false)
  })
})
