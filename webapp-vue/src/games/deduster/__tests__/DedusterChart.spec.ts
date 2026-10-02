import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DedusterChart from '../DedusterChart.vue'
import { VIEW, frameFor, xOf, yOf } from '../chart'
import type { DedusterRow } from '../scoreboard'

function row(userId: string, reactionsMs: number[]): DedusterRow {
  return {
    userId,
    name: userId,
    colorHex: '#2563eb',
    ink: '#fff',
    points: 0,
    provisional: false,
    tick: 0,
    reactionsMs,
    tilesCleared: reactionsMs.length,
    averageLabel: '',
    levelLabel: '',
    out: null,
    endedBy: 'TOO_LATE',
    wrongTileIndex: null,
    wrongReactionMs: null,
    implausible: false,
    restarted: false,
  }
}

const ROWS = [row('a', [300, 320, 310]), row('b', [400])]

function mountChart(props: Partial<InstanceType<typeof DedusterChart>['$props']> = {}) {
  return mount(DedusterChart, {
    props: { rows: ROWS, tiles: 48, intervalMs: 1300, selectedUserId: null, level: null, ...props },
    attachTo: document.body,
  })
}

/** happy-dom has no layout: the svg drawn at its viewBox size, so a client pixel is one unit. */
function atViewBoxSize(w: ReturnType<typeof mountChart>): void {
  vi.spyOn(w.get('svg').element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: VIEW.width,
    height: VIEW.height,
    right: VIEW.width,
    bottom: VIEW.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}

const FRAME = frameFor({ tiles: 48, intervalMs: 1300, rows: ROWS })

describe('DedusterChart', () => {
  it('draws one line and one dashed average per player, and the band above the beat', () => {
    const w = mountChart()

    expect(w.findAll('polyline')).toHaveLength(2)
    expect(w.findAll('[data-test="chart-average"]')).toHaveLength(2)
    expect(w.find('[data-test="chart-game-over"]').exists()).toBe(true)
  })

  it('dashes how a run ended: the wrong tap, the missed beat', () => {
    const w = mountChart({
      rows: [
        { ...row('a', [300, 320]), endedBy: 'WRONG_TILE', wrongTileIndex: 4, wrongReactionMs: 280 },
        row('b', [400]),
      ],
    })
    const tails = w.findAll('[data-test="chart-tail"]')

    expect(tails).toHaveLength(2)
    for (const tail of tails) expect(tail.attributes('stroke-dasharray')).toBeDefined()
  })

  it('brings the selected player forward and fades the others', () => {
    const w = mountChart({ selectedUserId: 'b' })
    const lines = w.findAll('polyline')

    expect(lines[0]!.attributes('stroke-opacity')).toBe('0.25')
    expect(lines[1]!.attributes('stroke-opacity')).toBe('1')
  })

  it('reports the level under the finger', async () => {
    const w = mountChart()
    atViewBoxSize(w)

    await w.get('svg').trigger('pointerdown', { clientX: VIEW.left, clientY: 100, isPrimary: true })

    expect(w.emitted('scrub')).toEqual([[0]])
  })

  it('selects a run when a tap lands on its line alone', async () => {
    const w = mountChart()
    atViewBoxSize(w)
    const on = { clientX: xOf(FRAME, 1), clientY: yOf(FRAME, 320), isPrimary: true }

    await w.get('svg').trigger('pointerdown', on)
    await w.get('svg').trigger('click', on)

    expect(w.emitted('select')).toEqual([['a']])
  })

  it('selects nothing for a tap between two lines, or a drag', async () => {
    const w = mountChart()
    atViewBoxSize(w)
    const between = { clientX: xOf(FRAME, 0), clientY: yOf(FRAME, 350), isPrimary: true }

    await w.get('svg').trigger('pointerdown', between)
    await w.get('svg').trigger('click', between)
    await w.get('svg').trigger('pointerdown', { ...between, clientX: xOf(FRAME, 1) - 20 })
    await w
      .get('svg')
      .trigger('click', { ...between, clientX: xOf(FRAME, 1), clientY: yOf(FRAME, 320) })

    expect(w.emitted('select')).toBeUndefined()
  })

  it('ends the scrub on a tap anywhere outside the chart', async () => {
    const w = mountChart({ level: 3 })

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(w.emitted('scrub')).toEqual([[null]])
    w.unmount()
  })

  it('writes the selected run’s average at the right end of its line', () => {
    expect(mountChart().find('[data-test="chart-average-label"]').exists()).toBe(false)
    expect(
      mountChart({ selectedUserId: 'a' }).get('[data-test="chart-average-label"]').text(),
    ).toBe('⌀ 310')
  })

  it('heads the curve and names both axes', () => {
    const w = mountChart()

    expect(w.get('h2').text()).toBe('Reaktionszeit (kleiner ist besser)')
    expect(w.get('[data-test="chart-y-title"]').text()).toBe('[ms]')
    expect(w.get('[data-test="chart-x-title"]').text()).toBe('Level')
    expect(w.get('[data-test="chart-x-title"]').attributes('text-anchor')).toBe('middle')
  })

  it('draws the x axis with a tick on every fifth level', () => {
    const w = mountChart()

    expect(w.find('[data-test="chart-x-axis"]').exists()).toBe(true)
    expect(w.findAll('[data-test="chart-x-tick"]').map((t) => t.text())).toEqual([
      '0',
      '5',
      '10',
      '15',
      '20',
      '25',
      '30',
      '35',
      '40',
      '45',
    ])
  })

  it('writes the y axis in German numbers, as the table does', () => {
    const w = mountChart({ intervalMs: 1300 })

    expect(w.findAll('[data-test="chart-y-label"]').map((t) => t.text())).toContain('1.300')
  })

  it('draws the grid lines light, in one colour, whatever the system theme', () => {
    for (const line of mountChart().findAll('[data-test="chart-grid"]')) {
      expect(line.attributes('class')).toBe('stroke-neutral-200')
    }
  })

  it('runs a faint line through the plot on every 300 ms', () => {
    // Fastest reaction 300 → floor 200; 300 … 1200 lie between it and the beat.
    expect(mountChart().findAll('[data-test="chart-grid"]')).toHaveLength(4)
  })

  it('reads the scrubbed level from 0, with the time only for a selected run', () => {
    expect(mountChart({ level: 1 }).get('[data-test="chart-readout"]').text()).toBe('Level 1')
    expect(
      mountChart({ level: 1, selectedUserId: 'a' }).get('[data-test="chart-readout"]').text(),
    ).toBe('Level 1 · 320 ms')
  })

  it('hangs the readout on the needle, on the left of it in the right half', () => {
    const left = mountChart({ level: 1 }).get('[data-test="chart-readout"]')
    expect(left.attributes('text-anchor')).toBe('start')
    expect(Number(left.attributes('x'))).toBe(xOf(FRAME, 1) + 4)

    const right = mountChart({ level: 47 }).get('[data-test="chart-readout"]')
    expect(right.attributes('text-anchor')).toBe('end')
    expect(Number(right.attributes('x'))).toBe(xOf(FRAME, 47) - 4)
  })

  it('marks the reactions that made a run implausible', () => {
    const w = mountChart({
      rows: [{ ...row('a', [110, 320]), implausible: true }, row('b', [400])],
    })

    expect(w.findAll('[data-test="chart-warning"]')).toHaveLength(1)
  })

  it('draws the guide line at the scrubbed level', () => {
    expect(mountChart({ level: 3 }).find('[data-test="chart-guide"]').exists()).toBe(true)
    expect(mountChart().find('[data-test="chart-guide"]').exists()).toBe(false)
  })
})
