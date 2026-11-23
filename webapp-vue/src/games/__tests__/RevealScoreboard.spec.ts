import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import {
  CELL_STAGGER_MS,
  HEAD_DELAY_MS,
  SOLUTION_DELAY_MS,
  VERDICT_MS,
} from '@/games/revealChoreography'
import type { ScoreboardColumn, ScoreboardRow } from '@/games/scoreboardColumns'
import { testTimeline } from '@/games/__tests__/timelineTiming'

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
/** The tips column with the solution standing over it, as Farbausmalung and Musterung have it. */
const SOLVED_TIP: ScoreboardColumn<Row> = { ...TIP, fact: 'Lösung' }

/** The component is generic, so `InstanceType<typeof …>['$props']` cannot reach its props. */
type Props = {
  rows: Row[]
  columns: ScoreboardColumn<Row>[]
  caption: string
  live: boolean
  nameWidth?: string | undefined
}

/** `animate` is the timeline's: false lands on a spent round, true arms the beats at now. */
function mountBoard(
  props: Partial<Props> & { animate?: boolean } = {},
  slots: Record<string, string> = {},
) {
  const { animate = false, ...rest } = props
  const merged: Props = {
    rows: [row({ userId: 'a' })],
    columns: [TIP],
    caption: 'Alle Tipps der Runde',
    live: false,
    ...rest,
  }
  const timeline = testTimeline(animate)

  const wrapper = mount(RevealScoreboard<Row>, {
    props: merged,
    slots: { 'cell-tip': '<span data-test="tip">{{ params.row.guess }}</span>', ...slots },
    global: { provide: timeline.provide },
  })
  timeline.arm()

  return wrapper
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
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('prints a unit beneath its column only, right-aligned in a band row under the table', () => {
    const wrapper = mountBoard({
      columns: [
        { ...TIP, unit: 'cm' },
        { key: 'other', label: 'X' },
      ],
    })
    const units = wrapper.get('tfoot [data-test="scoreboard-units"]')

    expect(units.findAll('th').map((cell) => cell.text())).toEqual(['[cm]'])
    expect(units.findAll('th, td')).toHaveLength(4)
    expect(units.findAll('th, td')[1]!.element.tagName).toBe('TH')
    expect(units.get('th').classes()).toContain('text-end')
  })

  it("puts a unit's name before its bracket where the sign alone is unclear", () => {
    const wrapper = mountBoard({
      columns: [{ key: 'tip', label: 'Tipp', unit: '×', unitName: 'Faktor' }],
    })

    expect(wrapper.get('[data-test="scoreboard-units"] th').text()).toBe('Faktor[×]')
  })

  it('has no unit row when no column names one', () => {
    expect(mountBoard().find('[data-test="scoreboard-units"]').exists()).toBe(false)
  })

  it('frames the columns the game hands it with Name and Pkt, in that order', () => {
    const wrapper = mountBoard({
      columns: [TIP, { key: 'clock', label: '[mm:ss]', width: '3.5rem' }],
    })

    const band = wrapper.findAll('[data-test="scoreboard-band"] th')

    expect(band.map((cell) => cell.text())).toEqual(['Name', 'Tipp', '[mm:ss]', 'Pkt'])
    expect(band.every((cell) => cell.attributes('scope') === 'col')).toBe(true)
  })

  // The clock is the entry's own (`GameEntry.durationMs`), so the frame brings it, like „Pkt“.
  it('adds the clock before Pkt as soon as a row has a duration', () => {
    const wrapper = mountBoard({
      rows: [
        row({ userId: 'a', durationLabel: '01:05' }),
        row({ userId: 'b', durationLabel: null }),
      ],
    })

    const band = wrapper.findAll('[data-test="scoreboard-band"] th')
    const clock = wrapper.get('[data-test="cell-clock-a"]')

    expect(band.map((cell) => cell.text())).toEqual(['Name', 'Tipp', 'Zeit', 'Pkt'])
    expect(wrapper.findAll('[data-test="scoreboard-units"] th').map((c) => c.text())).toEqual([
      '[mm:ss]',
    ])
    expect(wrapper.findAll('col')[2]!.attributes('style')).toBe('width: 3.5rem;')
    expect(clock.classes()).toContain('text-end')
    expect(clock.get('span').classes()).toEqual(['font-mono', 'text-xs'])
    expect(clock.text()).toBe('01:05')
  })

  it('says „no clock“ with an em dash for a row the round could not time', () => {
    const wrapper = mountBoard({
      rows: [
        row({ userId: 'a', durationLabel: '01:05' }),
        row({ userId: 'b', durationLabel: null }),
      ],
    })

    expect(wrapper.get('[data-test="cell-clock-b"]').text()).toBe('—')
  })

  it('leaves the clock out where no row has a duration', () => {
    const wrapper = mountBoard({
      rows: [row({ userId: 'a', durationLabel: null }), row({ userId: 'b' })],
    })

    const band = wrapper.findAll('[data-test="scoreboard-band"] th')

    expect(band.map((cell) => cell.text())).toEqual(['Name', 'Tipp', 'Pkt'])
  })

  it('keeps the heading and the live chip inside the head, not in a row above the table', () => {
    const wrapper = mountBoard({ live: true })

    expect(wrapper.get('thead h2').text()).toBe('Auswertung')
    expect(wrapper.get('[data-test="scoreboard-live"]').element.closest('thead')).not.toBeNull()
  })

  /** The points column is sized for three digits; the chip is wider and hangs out over the head. */
  it('lets the live chip overhang its narrow column to the left', () => {
    for (const columns of [[TIP], [SOLVED_TIP]]) {
      const chip = mountBoard({ columns, live: true }).get('[data-test="scoreboard-live"]')

      expect(chip.classes()).toContain('shrink-0')
      expect(chip.element.parentElement!.classList).toContain('justify-end')
    }
  })

  it('hides the live chip once the round is settled', () => {
    expect(mountBoard({ live: false }).find('[data-test="scoreboard-live"]').exists()).toBe(false)
  })

  it('lines a solution block up with its own column, over two head rows', () => {
    const wrapper = mountBoard(
      { columns: [SOLVED_TIP], live: true },
      { 'fact-tip': '<span data-test="solution">262,0</span>' },
    )
    const grid = headGrid(wrapper)

    const tipColumn = wrapper
      .findAll('[data-test="scoreboard-band"] th')
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

  it('lines several facts up with their own columns, the solution among them', () => {
    const LEVEL: ScoreboardColumn<Row> = {
      key: 'level',
      label: 'Level',
      fact: 'Levels',
      align: 'end',
    }
    const wrapper = mountBoard(
      { columns: [SOLVED_TIP, LEVEL] },
      {
        'fact-tip': '<span>262,0</span>',
        'fact-level': '<span data-test="fact">48</span>',
        'cell-level': '<span>1</span>',
      },
    )
    const grid = headGrid(wrapper)

    const levelColumn = wrapper
      .findAll('[data-test="scoreboard-band"] th')
      .findIndex((th) => th.text() === 'Level')
    const label = wrapper
      .get('thead')
      .findAll('th')
      .find((th) => th.text() === 'Levels')!
    const value = wrapper.get('[data-test="fact"]').element.closest('td')!

    expect(columnOf(grid, label.element)).toBe(levelColumn)
    expect(columnOf(grid, value)).toBe(levelColumn)
    expect(value.getAttribute('headers')).toBe(label.attributes('id'))
    expect(wrapper.get('thead').text()).toContain('Lösung')
    expect(wrapper.get('thead h2').element.closest('td')!.getAttribute('rowspan')).toBe('2')
    for (const gridRow of grid) {
      expect(gridRow.filter((cell) => cell !== undefined)).toHaveLength(4)
    }
  })

  it('leaves the solution rows out entirely for a game without one', () => {
    const wrapper = mountBoard()

    expect(wrapper.findAll('thead tr')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('Lösung')
  })

  it('keeps every head row as wide as the column band, with or without a solution', () => {
    for (const props of [{}, { columns: [SOLVED_TIP] }]) {
      const wrapper = mountBoard(props, { 'fact-tip': '<span>262,0</span>' })
      const columnCount = wrapper.get('[data-test="scoreboard-band"]').findAll('th').length

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

  it('writes my row on the verdict, cell by cell, the others once it has rung out', async () => {
    const wrapper = mountBoard({
      animate: true,
      rows: [row({ userId: 'a', tick: 0 }), row({ userId: 'b', tick: 1 })],
    })
    const mine = () => wrapper.get('[data-test="row-a"] th')
    const theirs = () => wrapper.get<HTMLElement>('[data-test="row-b"] th')

    vi.advanceTimersByTime(SOLUTION_DELAY_MS - 1)
    await wrapper.vm.$nextTick()
    expect(mine().classes()).toContain('opacity-0')

    vi.advanceTimersByTime(1)
    await wrapper.vm.$nextTick()
    expect(mine().classes()).toContain('opacity-100')
    expect(theirs().classes()).toContain('opacity-0')
    const cells = wrapper.findAll<HTMLElement>('[data-test="row-a"] th, [data-test="row-a"] td')
    expect(cells.map((cell) => cell.element.style.transitionDelay)).toEqual([
      '0ms',
      `${CELL_STAGGER_MS}ms`,
      `${2 * CELL_STAGGER_MS}ms`,
    ])

    vi.advanceTimersByTime(VERDICT_MS)
    await wrapper.vm.$nextTick()
    expect(theirs().classes()).toContain('opacity-100')
    expect(theirs().element.style.transitionDelay).toBe('0ms')
  })

  // An invisible name is still a button: tapped, it would replay someone else's tip before the
  // verdict (Verrohrung's water) or lay their painting on the picture early.
  it('lets nobody reach a row before it has landed', async () => {
    const wrapper = mountBoard({
      animate: true,
      rows: [row({ userId: 'a', tick: 0 }), row({ userId: 'b', tick: 1 })],
    })
    const inert = () =>
      ['a', 'b'].map((id) => wrapper.get(`[data-test="row-${id}"]`).attributes('inert'))

    expect(inert()).toEqual(['', ''])

    vi.advanceTimersByTime(SOLUTION_DELAY_MS)
    await wrapper.vm.$nextTick()
    expect(inert()).toEqual([undefined, ''])

    vi.advanceTimersByTime(VERDICT_MS)
    await wrapper.vm.$nextTick()
    expect(inert()).toEqual([undefined, undefined])
  })

  it('writes the head on its beat, the facts — which judge — with the verdict', async () => {
    const wrapper = mountBoard(
      { animate: true, columns: [SOLVED_TIP] },
      { 'fact-tip': '<span data-test="solution">262,0</span>' },
    )
    const heading = () => wrapper.get<HTMLElement>('thead h2').element.closest('td')!
    const value = () => wrapper.get('[data-test="solution"]').element.closest('td') as HTMLElement

    vi.advanceTimersByTime(HEAD_DELAY_MS)
    await wrapper.vm.$nextTick()
    expect(heading().className).toContain('opacity-100')
    expect(heading().style.transitionDelay).toBe('0ms')
    expect(value().className).toContain('opacity-0')

    vi.advanceTimersByTime(SOLUTION_DELAY_MS - HEAD_DELAY_MS)
    await wrapper.vm.$nextTick()
    expect(value().className).toContain('opacity-100')
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

  it('lets a game fill the name cell, and shows the name by default', () => {
    const custom = mountBoard(
      { rows: [row({ userId: 'a', name: 'Anna' })] },
      { name: '<button data-test="named">{{ params.row.name }}</button>' },
    )
    expect(custom.get('[data-test="named"]').text()).toBe('Anna')

    const plain = mountBoard({ rows: [row({ userId: 'a', name: 'Anna' })] })
    expect(plain.get('tbody th').text()).toBe('Anna')
  })
})
