import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import { HEAD_DELAY_MS, RESULTS_DELAY_MS } from '@/games/revealChoreography'
import type { ScoreboardColumn, ScoreboardRow } from '@/games/scoreboardColumns'

interface Row extends ScoreboardRow {
  guess: string
  guessHex: string
}

function row(over: Partial<Row> & { userId: string }): Row {
  return {
    name: over.userId,
    colorHex: '#b4c651',
    ink: '#111111',
    points: 1,
    provisional: false,
    tick: 0,
    guess: '262,0',
    guessHex: '#3b0764',
    ...over,
  }
}

const TIP: ScoreboardColumn<Row> = { key: 'tip', label: 'Tipp', width: '3.5rem', align: 'end' }

/** The component is generic, so `InstanceType<typeof …>['$props']` cannot reach its props. */
type Props = {
  rows: Row[]
  columns: ScoreboardColumn<Row>[]
  caption: string
  live: boolean
  animate: boolean
  solutionColumn?: string | undefined
  nameWidth?: string | undefined
}

function mountBoard(props: Partial<Props> = {}, slots: Record<string, string> = {}) {
  const merged: Props = {
    rows: [row({ userId: 'a' })],
    columns: [TIP],
    caption: 'Alle Tipps der Runde',
    live: false,
    animate: false,
    ...props,
  }

  return mount(RevealScoreboard<Row>, {
    props: merged,
    slots: { 'cell-tip': '<span data-test="tip">{{ params.row.guess }}</span>', ...slots },
  })
}

/**
 * The head cells on the grid a browser builds from them: `rowspan` occupies a column in the rows
 * below and `colspan` occupies its neighbours, so a cell's position among its row's own children
 * is not its column.
 */
function headGrid(wrapper: ReturnType<typeof mountBoard>): (Element | undefined)[][] {
  const rows = wrapper.findAll('thead tr')
  const grid: (Element | undefined)[][] = rows.map(() => [])

  rows.forEach((tr, index) => {
    let column = 0
    for (const cell of tr.findAll('th, td')) {
      while (grid[index]![column] !== undefined) column++
      const down = Number(cell.attributes('rowspan') ?? 1)
      const across = Number(cell.attributes('colspan') ?? 1)
      for (let step = 0; step < down; step++) {
        for (let span = 0; span < across; span++) grid[index + step]![column + span] = cell.element
      }
      column += across
    }
  })

  return grid
}

function columnOf(grid: (Element | undefined)[][], cell: Element): number {
  return grid.flatMap((gridRow) => gridRow.indexOf(cell)).find((index) => index >= 0) ?? -1
}

describe('RevealScoreboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('frames the columns the game hands it with Name and Pkt, in that order', () => {
    const wrapper = mountBoard({
      columns: [TIP, { key: 'clock', label: '[mm:ss]', width: '3.5rem' }],
    })

    const band = wrapper.findAll('thead tr:last-child th')

    expect(band.map((cell) => cell.text())).toEqual(['Name', 'Tipp', '[mm:ss]', 'Pkt'])
    expect(band.every((cell) => cell.attributes('scope') === 'col')).toBe(true)
  })

  it('keeps the heading and the live chip inside the head, not in a row above the table', () => {
    const wrapper = mountBoard({ live: true })

    expect(wrapper.get('thead h2').text()).toBe('Auswertung')
    expect(wrapper.get('[data-test="scoreboard-live"]').element.closest('thead')).not.toBeNull()
  })

  it('hides the live chip once the round is settled', () => {
    expect(mountBoard({ live: false }).find('[data-test="scoreboard-live"]').exists()).toBe(false)
  })

  it('lines a solution block up with its own column, over two head rows', () => {
    const wrapper = mountBoard(
      { solutionColumn: 'tip', live: true },
      { solution: '<span data-test="solution">262,0</span>' },
    )
    const grid = headGrid(wrapper)

    const tipColumn = wrapper
      .findAll('thead tr:last-child th')
      .findIndex((th) => th.text() === 'Tipp')
    const label = wrapper
      .get('thead')
      .findAll('th')
      .find((th) => th.text() === 'Lösung')!
    const value = wrapper.get('[data-test="solution"]').element.closest('td')!

    expect(columnOf(grid, label.element)).toBe(tipColumn)
    expect(columnOf(grid, value)).toBe(tipColumn)
    expect(wrapper.get('thead h2').element.closest('td')!.getAttribute('rowspan')).toBe('2')
    expect(
      wrapper.get('[data-test="scoreboard-live"]').element.closest('td')!.getAttribute('rowspan'),
    ).toBe('2')
  })

  it('leaves the solution rows out entirely for a game without one', () => {
    const wrapper = mountBoard()

    expect(wrapper.findAll('thead tr')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('Lösung')
  })

  it('keeps every head row as wide as the column band, with or without a solution', () => {
    for (const props of [{}, { solutionColumn: 'tip' }]) {
      const wrapper = mountBoard(props, { solution: '<span>262,0</span>' })
      const columnCount = wrapper.get('thead tr:last-child').findAll('th').length

      for (const gridRow of headGrid(wrapper)) {
        expect(gridRow.filter((cell) => cell !== undefined)).toHaveLength(columnCount)
      }
    }
  })

  it('gives every player a row, their name as its row header and their score last', () => {
    const wrapper = mountBoard({
      rows: [row({ userId: 'a', name: 'Fry', points: 2 }), row({ userId: 'b', name: 'Bender' })],
    })

    const names = wrapper.findAll('tbody th[scope="row"]')
    expect(names.map((cell) => cell.text())).toEqual(['Fry', 'Bender'])
    expect(wrapper.get('tbody tr:first-child td:last-child').text()).toBe('2')
  })

  it('says „nothing here“ with an em dash rather than a hyphen for an unscored row', () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a', points: null })] })

    expect(wrapper.get('tbody tr:first-child td:last-child').text()).toBe('—')
  })

  it('renders each column through its own slot', () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a', guess: '277,4' })] })

    expect(wrapper.get('[data-test="tip"]').text()).toBe('277,4')
  })

  it("paints a cell in the row's colour by default", () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a', colorHex: '#b4c651' })] })

    const tip = wrapper.get<HTMLElement>('[data-test="tip"]').element.closest('td')!
    expect(tip.style.backgroundColor).toBe('#b4c651')
  })

  it('lets a column bring its own surface, a decision per row', () => {
    const wrapper = mountBoard({
      columns: [
        { ...TIP, ground: (r: Row) => ({ backgroundColor: r.guessHex, color: '#ffffff' }) },
      ],
      rows: [row({ userId: 'a', guessHex: '#3b0764' })],
    })

    const tip = wrapper.get<HTMLElement>('[data-test="tip"]').element.closest('td')!
    expect(tip.style.backgroundColor).toBe('#3b0764')
  })

  it('leaves a cell bare — no ground, no padding — when its content brings its own', () => {
    // Musterung's chips are a pattern, not a row of table cells: they sit tight against each other
    // and against the cell's edge, so the cell must not inset or tint them.
    const wrapper = mountBoard({
      columns: [{ ...TIP, ground: () => null }],
    })

    const tip = wrapper.get<HTMLElement>('[data-test="tip"]').element.closest('td')!
    expect(tip.style.backgroundColor).toBe('')
    expect(tip.className).not.toContain('px-')
  })

  it('is fully written the moment a reload lands on a spent round', () => {
    const wrapper = mountBoard({ animate: false })
    const cells = wrapper.findAll('.transition-opacity')

    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) expect(cell.classes()).toContain('opacity-100')
  })

  it('types itself in, cell by cell and row by row, once it is a live reveal', async () => {
    const wrapper = mountBoard({
      animate: true,
      rows: [row({ userId: 'a', tick: 0 }), row({ userId: 'b', tick: 1 })],
    })

    // Two frames before anything is shown: the painted opacity-0 frame Firefox needs.
    expect(wrapper.get('tbody th').classes()).toContain('opacity-0')
    vi.advanceTimersByTime(50)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('tbody th').classes()).toContain('opacity-100')

    const first = wrapper.findAll<HTMLElement>('tbody tr:first-child th, tbody tr:first-child td')
    expect(first.map((cell) => cell.element.style.transitionDelay)).toEqual([
      `${RESULTS_DELAY_MS}ms`,
      `${RESULTS_DELAY_MS + 45}ms`,
      `${RESULTS_DELAY_MS + 90}ms`,
    ])

    const second = wrapper.get<HTMLElement>('tbody tr:nth-child(2) th')
    expect(second.element.style.transitionDelay).toBe(`${RESULTS_DELAY_MS + 120}ms`)
  })

  it('writes the head on beat three, the solution a row later', () => {
    const wrapper = mountBoard(
      { animate: true, solutionColumn: 'tip' },
      { solution: '<span data-test="solution">262,0</span>' },
    )

    const heading = wrapper.get<HTMLElement>('thead h2').element.closest('td')!
    const value = wrapper.get('[data-test="solution"]').element.closest('td') as HTMLElement

    expect(heading.style.transitionDelay).toBe(`${HEAD_DELAY_MS}ms`)
    expect(value.style.transitionDelay).toBe(`${HEAD_DELAY_MS + 120 + 45}ms`)
  })

  it('never puts the pulse on an element the fade is meant to hide', () => {
    // Tailwind's `pulse` declares only `50% { opacity: .5 }`, so its implicit endpoints take the
    // element's underlying opacity and the animation outranks the class: on an element that also
    // carries `opacity-0` it drives 0 → .5 → 0 rather than leaving it hidden, and the cell blinks
    // into view from the first frame instead of waiting for its `transition-delay`.
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

  it('keeps the gutters and the flush edges Guess Hue set', () => {
    const wrapper = mountBoard()

    expect(wrapper.get('table').classes()).toContain('border-spacing-x-1')
    expect(wrapper.get('table').classes()).toContain('border-spacing-y-0.5')
    expect(wrapper.get('div').classes()).toContain('-mx-1')
  })

  it('hands each column its width and leaves the flexible one alone', () => {
    const wrapper = mountBoard({
      columns: [{ key: 'tip', label: 'Tipp' }, TIP],
    })

    const widths = wrapper.findAll('col').map((col) => col.attributes('style') ?? '')

    expect(widths[1]).toBe('')
    expect(widths[2]).toContain('width: 3.5rem')
  })

  it('names the table for a screen reader', () => {
    const wrapper = mountBoard({ caption: 'Alle Tipps der Runde, nach Punkten sortiert' })

    expect(wrapper.get('caption').text()).toBe('Alle Tipps der Runde, nach Punkten sortiert')
    expect(wrapper.get('caption').classes()).toContain('sr-only')
  })
})
