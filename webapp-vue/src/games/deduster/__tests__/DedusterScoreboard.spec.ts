import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DedusterScoreboard from '../DedusterScoreboard.vue'
import type { DedusterRow } from '../scoreboard'

const viewer = vi.hoisted(() => ({ isSuperAdmin: false }))
vi.mock('@/auth/useAuth', async () => {
  const { ref } = await import('vue')
  return { useAuth: () => ({ user: ref({ isSuperAdmin: viewer.isSuperAdmin }) }) }
})

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
  implausible: ['REACTION_BELOW_HUMAN', 'SUBMITTED_BEFORE_RUN_END'],
  restarted: true,
}

describe('DedusterScoreboard', () => {
  beforeEach(() => {
    viewer.isSuperAdmin = false
  })

  const hintOf = (w: ReturnType<typeof mount>, mark: string) =>
    w.get(`[data-test="${mark}"]`).attributes('title')

  it('tells the players that a run is marked, not what caught it', () => {
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

    expect(hintOf(w, 'mark-implausible-u1')).toBe('Unplausible Zeiten in diesem Lauf')
    expect(hintOf(w, 'mark-restarted-u1')).toBe('Nach dem Neuladen gespielt')
  })

  it('tells a super-admin every reason the server stored', () => {
    viewer.isSuperAdmin = true
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

    expect(hintOf(w, 'mark-implausible-u1')).toBe(
      'Unplausible Zeiten in diesem Lauf: Reaktion unter 120 ms · vor dem Laufende eingegangen',
    )
  })

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
    expect(name.get('[data-test="mark-implausible-u1"]').find('svg').exists()).toBe(true)
    expect(name.get('[data-test="mark-restarted-u1"]').find('svg').exists()).toBe(true)
    expect(w.html()).not.toContain('⚠')
    expect(w.html()).not.toContain('↻')
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
