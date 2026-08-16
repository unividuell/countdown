import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GuessHueScoreboard from '@/games/guesshue/GuessHueScoreboard.vue'
import { RESULTS_DELAY_MS } from '@/games/guesshue/reveal'
import type { ScoreboardRow, ScoreboardSolution } from '@/games/guesshue/scoreboard'

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

  it('names each player from a row header, so a cell is never read bare', () => {
    // `<th scope="row">` is what makes a screen reader say "Leela, Tipp 128,4" and not "128,4".
    const w = mountBoard({ rows: [row({ userId: 'leela', name: 'Leela' })] })
    const header = w.get('tbody th')

    expect(header.attributes('scope')).toBe('row')
    expect(header.text()).toBe('Leela')
  })

  it('heads all four columns', () => {
    const w = mountBoard()
    const band = w.findAll('thead tr:last-child th')

    expect(band.map((cell) => cell.text())).toEqual(['Name', 'Tipp', 'Differenz', 'Pkt'])
    expect(band.every((cell) => cell.attributes('scope') === 'col')).toBe(true)
  })

  it("keeps the head block in the original's arrangement", () => {
    // The heading sits beside the solution stack, not above the table, and the chip sits over the
    // column that can still change. Both span the two head rows.
    const w = mountBoard({ live: true })

    expect(w.get('thead h2').text()).toBe('Auswertung')
    expect(w.get('thead h2').element.closest('td')!.getAttribute('rowspan')).toBe('2')
    expect(
      w.get('[data-test="hue-scoreboard-live"]').element.closest('td')!.getAttribute('rowspan'),
    ).toBe('2')
    expect(w.get('[data-test="hue-scoreboard-solution"]').attributes('headers')).toBe(
      'hue-solution',
    )
    expect(w.get('#hue-solution').text()).toBe('Lösung')
  })

  it('lines the solution value up under „Lösung“ and over „Tipp“, in column 2 and no other', () => {
    // The head block spans two rows. Row 1's own cells are, in order, the rowspanned heading
    // (column 1), the „Lösung“ label (column 2), the gap, and the rowspanned live chip — so the
    // label is the row's *second* own cell. Row 2 only supplies the columns the rowspan cells
    // do not, so its first own cell is also column 2: the solution value has to be that first
    // cell, or a filler pushed in front of it would silently slide it into column 3 while every
    // other assertion here — the `rowspan`, the `headers` link, the band order — stays green.
    const w = mountBoard({ live: true })
    const [row1, row2, bandRow] = w.findAll('thead tr')

    expect(row1!.findAll('td, th')[1]!.attributes('id')).toBe('hue-solution')
    expect(row2!.findAll('td, th')[0]!.attributes('data-test')).toBe('hue-scoreboard-solution')
    expect(bandRow!.findAll('th')[1]!.text()).toBe('Tipp')
  })

  it('anchors the head band in near-black — the anchor that makes the colour below read as a table', () => {
    const w = mountBoard({ live: true })
    const headCells = [w.get('#hue-solution'), ...w.findAll('thead tr:last-child th')]

    expect(headCells.length).toBe(5)
    for (const cell of headCells) {
      expect(cell.classes()).toContain('bg-neutral-900')
    }
  })

  it("keeps a thin white gutter between every cell via the table's own border-spacing", () => {
    const w = mountBoard()

    expect(w.get('table').classes()).toContain('border-spacing-x-1')
    expect(w.get('table').classes()).toContain('border-spacing-y-0.5')
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

  it('shows the live chip only where a score can still be overtaken', () => {
    expect(mountBoard({ live: false }).find('[data-test="hue-scoreboard-live"]').exists()).toBe(
      false,
    )

    const live = mountBoard({ live: true }).get('[data-test="hue-scoreboard-live"]')
    expect(live.classes()).toEqual(expect.arrayContaining(['bg-live', 'animate-pulse']))
    // The pulse means nothing over the wire; the chip has to say it.
    expect(live.text()).toContain('ändern')
  })

  it('pulses only the points that can still move, and says so in words too', () => {
    const w = mountBoard({
      rows: [
        row({ userId: 'a', provisional: true, points: 2 }),
        row({ userId: 'b', provisional: false, points: 0 }),
      ],
    })
    const [first, second] = w.findAll('[data-test="hue-scoreboard-points"]')

    // The cell itself slants; the pulse sits one element deeper, so the fade above it can still
    // hide the whole thing — see the test below for why the two may not share an element.
    expect(first!.classes()).toContain('italic')
    expect(first!.get('.animate-pulse').classes()).toContain('motion-reduce:animate-none')
    expect(first!.text()).toContain('vorläufig')

    expect(second!.classes()).not.toContain('italic')
    expect(second!.find('.animate-pulse').exists()).toBe(false)
    expect(second!.text()).toBe('0')
  })

  it('never puts the pulse on an element the fade is meant to hide', () => {
    // Tailwind's `pulse` declares only `50% { opacity: .5 }`, so the implicit 0%/100% endpoints
    // take the element's *underlying* opacity — and an animation outranks a plain class. On an
    // element that also carries `opacity-0` the animation therefore drives it 0 → .5 → 0 every
    // two seconds instead of leaving it hidden, so the cell blinks into view from the first
    // frame, long before its own `transition-delay` is up. Measured in Chromium: that element's
    // computed opacity reads 0.5 at t=1000ms while `opacity-0` is on it.
    //
    // The two must therefore live on two elements — an outer one the fade hides, an inner one
    // that pulses inside it. Nesting is what makes that safe: an `opacity-0` ancestor composites
    // its whole subtree away no matter what the child's own opacity animates to.
    const w = mountBoard({
      live: true,
      rows: [row({ userId: 'a', provisional: true, points: 2 })],
    })

    const pulsing = w.findAll('.animate-pulse')
    expect(pulsing.length).toBeGreaterThan(0)
    for (const el of pulsing) {
      expect(el.classes()).not.toContain('transition-opacity')
      expect(el.classes()).not.toContain('opacity-0')
      expect(el.classes()).not.toContain('opacity-100')
    }
  })

  it('is fully written the moment a reload lands on a spent round', () => {
    // `.transition-opacity` is the static class every cell bound to `:class="opacity"` also
    // carries, so this selects exactly the cells the fade actually touches — unlike selecting
    // every `td`/`th`, which would also catch the layout's empty placeholder cells that carry no
    // opacity class at all and would pass this assertion no matter what the component did.
    const w = mountBoard({ animate: false })
    const cells = w.findAll('.transition-opacity')

    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      expect(cell.classes()).toContain('opacity-100')
    }
  })

  it('types itself in, cell by cell and row by row, once it is a live reveal', async () => {
    const w = mountBoard({
      animate: true,
      rows: [row({ userId: 'a', tick: 0 }), row({ userId: 'b', tick: 1 })],
    })

    // Two frames before anything is shown: the painted opacity-0 frame Firefox needs.
    expect(w.get('tbody th').classes()).toContain('opacity-0')
    vi.advanceTimersByTime(50)
    await w.vm.$nextTick()
    expect(w.get('tbody th').classes()).toContain('opacity-100')

    const cells = w.findAll<HTMLElement>('tbody tr:first-child th, tbody tr:first-child td')
    const delays = cells.map((cell) => cell.element.style.transitionDelay)
    expect(delays).toEqual([
      `${RESULTS_DELAY_MS}ms`,
      `${RESULTS_DELAY_MS + 45}ms`,
      `${RESULTS_DELAY_MS + 90}ms`,
      `${RESULTS_DELAY_MS + 135}ms`,
    ])

    const second = w.get<HTMLElement>('tbody tr:nth-child(2) th')
    expect(second.element.style.transitionDelay).toBe(`${RESULTS_DELAY_MS + 120}ms`)
  })

  it('renders nothing at all when no guess could be ranked', () => {
    const w = mountBoard({ rows: [] })

    expect(w.find('table').exists()).toBe(false)
  })
})
