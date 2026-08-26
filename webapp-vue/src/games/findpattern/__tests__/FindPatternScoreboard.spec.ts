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

  it('lines the solution up with the tip column, not off to the side', () => {
    const wrapper = mountBoard()

    const headerLabels = wrapper.get('thead tr:last-child').findAll('th')
    const tipColumnIndex = headerLabels.findIndex((th) => th.text() === 'Tipp')

    const labelCell = wrapper
      .get('thead')
      .findAll('th')
      .find((th) => th.text() === 'Lösung')
    const labelRow = labelCell?.element.parentElement
    const labelColumnIndex = labelRow
      ? Array.from(labelRow.children).indexOf(labelCell!.element)
      : -1

    const chipCell = wrapper.get('[data-test="solution-chip"]').element.closest('td, th')
    const chipRow = chipCell?.parentElement
    const chipColumnIndex =
      chipRow && chipCell ? Array.from(chipRow.children).indexOf(chipCell) : -1

    expect(labelColumnIndex).toBe(tipColumnIndex)
    expect(chipColumnIndex).toBe(tipColumnIndex)
  })

  it('keeps the solution in the tip column even with the clock column present', () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a', durationLabel: '00:42' })] })

    const headerLabels = wrapper.get('thead tr:last-child').findAll('th')
    const tipColumnIndex = headerLabels.findIndex((th) => th.text() === 'Tipp')

    const chipCell = wrapper.get('[data-test="solution-chip"]').element.closest('td, th')
    const chipRow = chipCell?.parentElement
    const chipColumnIndex =
      chipRow && chipCell ? Array.from(chipRow.children).indexOf(chipCell) : -1

    expect(chipColumnIndex).toBe(tipColumnIndex)
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

  it('never puts the pulse on an element the fade is meant to hide', () => {
    // Tailwind's `pulse` declares only `50% { opacity: .5 }`, so its implicit 0%/100% endpoints
    // take the element's *underlying* opacity — and an animation outranks a plain class. On an
    // element that also carries `opacity-0` the animation therefore drives it 0 → .5 → 0 instead
    // of leaving it hidden, and the cell blinks into view from the first frame, long before its
    // own `transition-delay` is up. The two must therefore live on two elements — an outer one
    // the fade hides, an inner one that pulses inside it — independent of whether `shown` happens
    // to be true or false at the time this runs.
    const wrapper = mountBoard({
      live: true,
      rows: [row({ userId: 'a', provisional: true, points: 2 })],
    })

    const pulsing = wrapper.findAll('.animate-pulse')
    expect(pulsing.length).toBeGreaterThan(0)
    for (const el of pulsing) {
      expect(el.classes()).not.toContain('transition-opacity')
      expect(el.classes()).not.toContain('opacity-0')
      expect(el.classes()).not.toContain('opacity-100')
    }
  })

  it('shows a pulsing live chip while the round can still change', () => {
    const wrapper = mountBoard({ live: true })

    const live = wrapper.get('[data-test="pattern-scoreboard-live"]')
    expect(live.text()).toContain('live')
    expect(live.classes()).toContain('animate-pulse')
  })

  it('hides the live chip once the round is settled', () => {
    const wrapper = mountBoard({ live: false })

    expect(wrapper.find('[data-test="pattern-scoreboard-live"]').exists()).toBe(false)
  })

  it('is fully written the moment a reload lands on a spent round', () => {
    // `.transition-opacity` is the static class every cell bound to `:class="opacity"` carries,
    // so this selects exactly the cells the fade touches.
    const wrapper = mountBoard({ animate: false })
    const cells = wrapper.findAll('.transition-opacity')

    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      expect(cell.classes()).toContain('opacity-100')
    }
  })

  it('types itself in, cell by cell and row by row, once it is a live reveal', async () => {
    const wrapper = mountBoard({
      animate: true,
      rows: [row({ userId: 'a', tick: 0 }), row({ userId: 'b', tick: 1 })],
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
