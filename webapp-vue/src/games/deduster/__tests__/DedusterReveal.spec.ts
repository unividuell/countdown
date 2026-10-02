import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DedusterChart from '../DedusterChart.vue'
import DedusterReveal from '../DedusterReveal.vue'
import DedusterScoreboard from '../DedusterScoreboard.vue'
import type { DedusterRow } from '../scoreboard'

const PAYLOAD = { cols: 2, rows: 2, intervalMs: 1000, order: [3, 1, 0, 2] }

function row(
  userId: string,
  reactionsMs: number[],
  endedBy: DedusterRow['endedBy'],
  wrongTileIndex: number | null,
): DedusterRow {
  return {
    userId,
    name: userId,
    colorHex: '#7c3aed',
    ink: '#fff',
    points: 0,
    provisional: false,
    tick: 0,
    reactionsMs,
    tilesCleared: reactionsMs.length,
    averageLabel: '',
    levelLabel: '',
    out: null,
    endedBy,
    wrongTileIndex,
    wrongReactionMs: null,
    implausible: false,
    restarted: false,
  }
}

const ROWS = [
  row('a', [300], 'WRONG_TILE', 2),
  row('b', [300], 'WRONG_TILE', 2),
  row('c', [300, 300], 'TOO_LATE', null),
]

function mountReveal() {
  return mount(DedusterReveal, {
    props: {
      payload: PAYLOAD,
      photoUrl: '/asset/98',
      rows: ROWS,
      mineUserId: 'c',
      live: false,
      animate: false,
    },
  })
}

describe('DedusterReveal', () => {
  it('shows the whole photo, the table and the curve', () => {
    const w = mountReveal()

    expect(w.get('img').attributes('src')).toBe('/asset/98')
    expect(w.findComponent(DedusterScoreboard).exists()).toBe(true)
    expect(w.findComponent(DedusterChart).exists()).toBe(true)
  })

  it('puts the curve between the photo and the table', () => {
    const html = mountReveal().html()

    expect(html.indexOf('data-test="deduster-chart"')).toBeLessThan(
      html.indexOf('data-test="scoreboard"'),
    )
  })

  it('outlines the right tile and the wrong ones of the scrubbed level, with a dot per player', async () => {
    const w = mountReveal()

    w.getComponent(DedusterChart).vm.$emit('scrub', 1)
    await w.vm.$nextTick()

    expect(w.findAll('[data-test="reveal-correct"]').map((c) => c.attributes('data-tile'))).toEqual(
      ['1'],
    )
    const wrong = w.findAll('[data-test="reveal-wrong"]')
    expect(wrong.map((c) => c.attributes('data-tile'))).toEqual(['2'])
    expect(wrong[0]!.findAll('[data-test="reveal-dot"]')).toHaveLength(2)
  })

  it('starts with the viewer selected and lets a row take over', async () => {
    const w = mountReveal()
    expect(w.getComponent(DedusterChart).props('selectedUserId')).toBe('c')

    w.getComponent(DedusterScoreboard).vm.$emit('select', 'a')
    await w.vm.$nextTick()
    expect(w.getComponent(DedusterChart).props('selectedUserId')).toBe('a')
  })
})
