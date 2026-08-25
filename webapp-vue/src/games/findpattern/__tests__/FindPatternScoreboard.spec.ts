import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternScoreboard from '@/games/findpattern/FindPatternScoreboard.vue'
import { RESULTS_DELAY_MS } from '@/games/revealChoreography'
import type { ScoreRow } from '@/games/findpattern/scoreboard'

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

function mountBoard(rows: ScoreRow[]) {
  return mount(FindPatternScoreboard, {
    props: { rows, solutionChips: CHIPS, live: false, animate: false },
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
    const wrapper = mountBoard([
      row({ userId: 'a' }),
      row({ userId: 'b', points: 0, correct: false }),
    ])

    expect(wrapper.findAll('[data-test="solution-chip"]')).toHaveLength(4)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('prints every tone index, so the palette can be read against it', () => {
    const wrapper = mountBoard([row({ userId: 'a' })])

    expect(wrapper.get('[data-test="tip-a"]').text()).toBe('1230')
  })

  it('leaves the clock column out of a round that was not timed', () => {
    const wrapper = mountBoard([row({ userId: 'a' })])

    expect(wrapper.text()).not.toContain('[mm:ss]')
  })

  it('shows the clock column as soon as a row has a duration', () => {
    const wrapper = mountBoard([row({ userId: 'a', durationLabel: '00:42' })])

    expect(wrapper.text()).toContain('[mm:ss]')
    expect(wrapper.text()).toContain('00:42')
  })

  it('says so when somebody gave up instead of printing four empty chips', () => {
    const wrapper = mountBoard([
      row({ userId: 'a', gaveUp: true, chips: [], correct: false, points: 0 }),
    ])

    expect(wrapper.get('[data-test="tip-a"]').text()).toContain('aufgegeben')
  })

  it('never puts a fade and a pulse on one element', () => {
    const wrapper = mountBoard([row({ userId: 'a', provisional: true })])

    const both = wrapper
      .findAll('*')
      .filter((el) => el.classes('animate-pulse') && el.classes('opacity-0'))
    expect(both).toHaveLength(0)
  })

  it('shows a pulsing live chip while the round can still change', () => {
    const wrapper = mount(FindPatternScoreboard, {
      props: { rows: [row({ userId: 'a' })], solutionChips: CHIPS, live: true, animate: false },
    })

    const live = wrapper.get('[data-test="pattern-scoreboard-live"]')
    expect(live.text()).toContain('live')
    expect(live.classes()).toContain('animate-pulse')
  })

  it('hides the live chip once the round is settled', () => {
    const wrapper = mountBoard([row({ userId: 'a' })])

    expect(wrapper.find('[data-test="pattern-scoreboard-live"]').exists()).toBe(false)
  })

  it('is fully written the moment a reload lands on a spent round', () => {
    // `.transition-opacity` is the static class every cell bound to `:class="opacity"` carries,
    // so this selects exactly the cells the fade touches.
    const wrapper = mountBoard([row({ userId: 'a' })])
    const cells = wrapper.findAll('.transition-opacity')

    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      expect(cell.classes()).toContain('opacity-100')
    }
  })

  it('types itself in, cell by cell and row by row, once it is a live reveal', async () => {
    const wrapper = mount(FindPatternScoreboard, {
      props: {
        rows: [row({ userId: 'a', tick: 0 }), row({ userId: 'b', tick: 1 })],
        solutionChips: CHIPS,
        live: false,
        animate: true,
      },
    })

    // Two frames before anything is shown: the painted opacity-0 frame Firefox needs.
    expect(wrapper.get('tbody td').classes()).toContain('opacity-0')
    vi.advanceTimersByTime(50)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('tbody td').classes()).toContain('opacity-100')

    const cells = wrapper.findAll<HTMLElement>('tbody tr:first-child td')
    const delays = cells.map((cell) => cell.element.style.transitionDelay)
    expect(delays).toEqual([
      `${RESULTS_DELAY_MS}ms`,
      `${RESULTS_DELAY_MS + 45}ms`,
      `${RESULTS_DELAY_MS + 90}ms`,
    ])

    const second = wrapper.get<HTMLElement>('tbody tr:nth-child(2) td')
    expect(second.element.style.transitionDelay).toBe(`${RESULTS_DELAY_MS + 120}ms`)
  })
})
