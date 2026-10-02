import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DedusterChart from '../DedusterChart.vue'
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
    implausible: false,
    restarted: false,
  }
}

const ROWS = [row('a', [300, 320, 310]), row('b', [400])]

function mountChart(props: Partial<InstanceType<typeof DedusterChart>['$props']> = {}) {
  return mount(DedusterChart, {
    props: { rows: ROWS, tiles: 48, intervalMs: 1300, selectedUserId: null, level: null, ...props },
  })
}

describe('DedusterChart', () => {
  it('draws one line and one dashed average per player, and the band above the beat', () => {
    const w = mountChart()

    expect(w.findAll('polyline')).toHaveLength(2)
    expect(w.findAll('[data-test="chart-average"]')).toHaveLength(2)
    expect(w.find('[data-test="chart-game-over"]').exists()).toBe(true)
  })

  it('brings the selected player forward and fades the others', () => {
    const w = mountChart({ selectedUserId: 'b' })
    const lines = w.findAll('polyline')

    expect(lines[0]!.attributes('stroke-opacity')).toBe('0.25')
    expect(lines[1]!.attributes('stroke-opacity')).toBe('1')
  })

  it('reports the level under the finger', async () => {
    const w = mountChart()
    const svg = w.get('svg').element
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 320,
      height: 200,
      right: 320,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    await w.get('svg').trigger('pointerdown', { clientX: 36, clientY: 100, isPrimary: true })

    expect(w.emitted('scrub')).toEqual([[0]])
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

  it('reads the scrubbed level as the axis counts it, from 0', () => {
    expect(
      mountChart({ level: 1, selectedUserId: 'a' }).get('[data-test="chart-readout"]').text(),
    ).toBe('Level 1 · 320 ms')
  })

  it('draws the guide line at the scrubbed level', () => {
    expect(mountChart({ level: 3 }).find('[data-test="chart-guide"]').exists()).toBe(true)
    expect(mountChart().find('[data-test="chart-guide"]').exists()).toBe(false)
  })
})
