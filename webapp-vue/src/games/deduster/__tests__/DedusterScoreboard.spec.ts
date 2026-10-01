import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DedusterScoreboard from '../DedusterScoreboard.vue'
import type { DedusterRow } from '../scoreboard'

const ROW: DedusterRow = {
  userId: 'u1',
  name: 'Anna',
  colorHex: '#2563eb',
  ink: '#ffffff',
  points: 0,
  provisional: false,
  tick: 0,
  reactionsMs: [],
  tilesCleared: 0,
  averageLabel: '—',
  levelLabel: '0 %',
  out: 'zu spät',
  endedBy: 'TOO_LATE',
  wrongTileIndex: null,
  implausible: true,
  restarted: true,
}

describe('DedusterScoreboard', () => {
  it('shows the original’s columns and both marks', () => {
    const w = mount(DedusterScoreboard, {
      props: { rows: [ROW], live: false, animate: false, selectedUserId: null },
    })

    expect(w.get('[data-test="cell-avg-u1"]').text()).toBe('—')
    expect(w.get('[data-test="cell-level-u1"]').text()).toBe('0 %')
    expect(w.get('[data-test="cell-out-u1"]').text()).toContain('zu spät')
    expect(w.find('[data-test="mark-implausible-u1"]').exists()).toBe(true)
    expect(w.find('[data-test="mark-restarted-u1"]').exists()).toBe(true)
  })

  it('selects a player by their name, for the curve', async () => {
    const w = mount(DedusterScoreboard, {
      props: { rows: [ROW], live: false, animate: false, selectedUserId: null },
    })

    await w.get('[data-test="select-u1"]').trigger('click')

    expect(w.emitted('select')).toEqual([['u1']])
  })
})
