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

  it('draws the guide line at the scrubbed level', () => {
    expect(mountChart({ level: 3 }).find('[data-test="chart-guide"]').exists()).toBe(true)
    expect(mountChart().find('[data-test="chart-guide"]').exists()).toBe(false)
  })
})
