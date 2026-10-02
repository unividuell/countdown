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
  levelLabel: '0',
  out: 'zu spät',
  endedBy: 'TOO_LATE',
  wrongTileIndex: null,
  wrongReactionMs: null,
  implausible: true,
  restarted: true,
}

describe('DedusterScoreboard', () => {
  it('shows the original’s columns and both marks', () => {
    const w = mount(DedusterScoreboard, {
      props: {
        rows: [ROW],
        live: false,
        animate: false,
        selectedUserId: null,
        intervalMs: 1500,
        tiles: 48,
      },
    })

    expect(w.get('[data-test="cell-avg-u1"]').text()).toBe('—')
    expect(w.get('[data-test="cell-level-u1"]').text()).toBe('0')
    expect(w.get('[data-test="cell-out-u1"]').text()).toBe('zu spät')
    // The marks stand behind the name, inside its button, never cut off by a long name.
    const name = w.get('[data-test="select-u1"]')
    expect(name.find('[data-test="mark-implausible-u1"]').exists()).toBe(true)
    expect(name.find('[data-test="mark-restarted-u1"]').exists()).toBe(true)
    expect(name.get('[data-test="mark-implausible-u1"]').classes()).toContain('shrink-0')
  })

  it('heads the table with the round’s tempo and size, units in brackets on the header', () => {
    const w = mount(DedusterScoreboard, {
      props: {
        rows: [ROW],
        live: false,
        animate: false,
        selectedUserId: null,
        intervalMs: 1500,
        tiles: 48,
      },
    })
    const heads = w.findAll('thead th').map((th) => th.text())

    expect(heads).toEqual(['Max [ms]', 'Levels', 'Name', '⌀ [ms]', 'Level [%]', 'raus', 'Pkt'])
    expect(w.get('[data-test="fact-max"]').text()).toBe('1.500')
    expect(w.get('[data-test="fact-levels"]').text()).toBe('48')
  })

  it('selects a player by their name, for the curve', async () => {
    const w = mount(DedusterScoreboard, {
      props: {
        rows: [ROW],
        live: false,
        animate: false,
        selectedUserId: null,
        intervalMs: 1500,
        tiles: 48,
      },
    })

    await w.get('[data-test="select-u1"]').trigger('click')

    expect(w.emitted('select')).toEqual([['u1']])
  })

  it('keeps its focus ring inside the cell that clips it', () => {
    const w = mount(DedusterScoreboard, {
      props: {
        rows: [ROW],
        live: false,
        animate: false,
        selectedUserId: null,
        intervalMs: 1500,
        tiles: 48,
      },
    })

    const classes = w.get('[data-test="select-u1"]').classes()

    expect(classes).toContain('focus-visible:outline-2')
    expect(classes).toContain('focus-visible:-outline-offset-2')
  })
})
