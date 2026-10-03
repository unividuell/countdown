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
    implausible: [],
    restarted: false,
  }
}

const ROWS = [
  { ...row('a', [300], 'WRONG_TILE', 2), wrongReactionMs: 250 },
  row('b', [300], 'WRONG_TILE', 2),
  row('c', [300, 300], 'TOO_LATE', null),
]

function mountReveal() {
  return mount(DedusterReveal, {
    props: {
      payload: PAYLOAD,
      photoUrl: '/asset/98',
      rows: ROWS,
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

  it('outlines the right tile and the wrong ones of the scrubbed level', async () => {
    const w = mountReveal()

    w.getComponent(DedusterChart).vm.$emit('scrub', 1)
    await w.vm.$nextTick()

    expect(w.findAll('[data-test="reveal-correct"]').map((c) => c.attributes('data-tile'))).toEqual(
      ['1'],
    )
    const wrong = w.findAll('[data-test="reveal-wrong"]')
    expect(wrong.map((c) => c.attributes('data-tile'))).toEqual(['2'])
  })

  it('charts each marked tile: a slot per player, bars where there is a time', async () => {
    const w = mountReveal()

    w.getComponent(DedusterChart).vm.$emit('scrub', 1)
    await w.vm.$nextTick()

    const correct = w.get('[data-test="reveal-correct"]')
    expect(correct.findAll('[data-test="reveal-slot"]')).toHaveLength(3)
    expect(
      correct.findAll('[data-test="reveal-bar"]').map((b) => b.attributes('data-user')),
    ).toEqual(['c'])
    // The wrong tile holds a's tap; b's has no time, so its slot stays empty.
    const wrong = w.get('[data-test="reveal-wrong"]')
    expect(wrong.findAll('[data-test="reveal-bar"]').map((b) => b.attributes('data-user'))).toEqual(
      ['a'],
    )
    expect(w.find('[data-test="reveal-dot"]').exists()).toBe(false)
  })

  it('pales the bar of a missed beat and warns on an implausible one', async () => {
    const w = mount(DedusterReveal, {
      props: {
        payload: PAYLOAD,
        photoUrl: '/asset/98',
        rows: [
          row('a', [300], 'TOO_LATE', null),
          { ...row('b', [300, 110], 'TOO_LATE', null), implausible: ['REACTION_BELOW_HUMAN'] },
        ],
        live: false,
        animate: false,
      },
    })

    w.getComponent(DedusterChart).vm.$emit('scrub', 1)
    await w.vm.$nextTick()

    const bars = w.get('[data-test="reveal-correct"]').findAll('[data-test="reveal-bar"]')
    expect(bars.map((b) => b.attributes('data-kind'))).toEqual(['missed', 'hit'])
    expect(bars[1]!.find('[data-test="reveal-warning"]').exists()).toBe(true)
    expect(w.html()).not.toContain('⚠')
    expect(bars[0]!.find('[data-test="reveal-warning"]').exists()).toBe(false)
  })

  it('starts with no run selected; a name or a line selects, the same again lets go', async () => {
    const w = mountReveal()
    const selected = () => w.getComponent(DedusterChart).props('selectedUserId')
    expect(selected()).toBeNull()

    w.getComponent(DedusterScoreboard).vm.$emit('select', 'a')
    await w.vm.$nextTick()
    expect(selected()).toBe('a')

    w.getComponent(DedusterChart).vm.$emit('select', 'b')
    await w.vm.$nextTick()
    expect(selected()).toBe('b')

    w.getComponent(DedusterScoreboard).vm.$emit('select', 'b')
    await w.vm.$nextTick()
    expect(selected()).toBeNull()
  })

  it('lets go of the scrub when the chart says so', async () => {
    const w = mountReveal()
    w.getComponent(DedusterChart).vm.$emit('scrub', 1)
    await w.vm.$nextTick()
    w.getComponent(DedusterChart).vm.$emit('scrub', null)
    await w.vm.$nextTick()

    expect(w.findAll('[data-test="reveal-correct"]')).toHaveLength(0)
  })
})
