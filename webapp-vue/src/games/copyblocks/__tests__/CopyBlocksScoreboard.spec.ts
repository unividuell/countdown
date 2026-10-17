import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CopyBlocksScoreboard from '@/games/copyblocks/CopyBlocksScoreboard.vue'
import type { ScoreRow } from '@/games/copyblocks/scoreboard'

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#336699',
    ink: '#ffffff',
    points: 0,
    provisional: false,
    tick: 0,
    correct: false,
    durationLabel: null,
    outcome: null,
    kdLabel: null,
    ...over,
  }
}

function mountBoard(rows: ScoreRow[], selectedUserId: string | null = null) {
  return mount(CopyBlocksScoreboard, {
    props: { rows, live: false, animate: false, selectedUserId },
  })
}

describe('CopyBlocksScoreboard', () => {
  it('shows the clock only for a timed round', () => {
    const timed = mountBoard([row({ userId: 'a', durationLabel: '00:42' })])
    const untimed = mountBoard([row({ userId: 'a' })])

    expect(timed.text()).toContain('[mm:ss]')
    expect(timed.text()).toContain('00:42')
    expect(untimed.text()).not.toContain('[mm:ss]')
  })

  it('puts K/D right behind the name, and explains it beneath the table', () => {
    const wrapper = mountBoard([
      row({ userId: 'a', kdLabel: '24/3', durationLabel: '00:42' }),
      row({ userId: 'b' }),
    ])
    const text = wrapper.text()

    expect(text.indexOf('K/D*')).toBeGreaterThan(-1)
    expect(text.indexOf('K/D*')).toBeLessThan(text.indexOf('[mm:ss]'))
    expect(text).toContain('24/3')
    expect(wrapper.get('[data-test="copy-blocks-kd-legend"]').text()).toBe(
      '* K korrekt · D daneben (fehlend, zu viel, falscher Typ)',
    )
  })

  it('turns a name into a button that says which is picked', async () => {
    const wrapper = mountBoard([row({ userId: 'a' }), row({ userId: 'b' })], 'a')

    expect(wrapper.get('[data-test="select-a"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-test="select-b"]').attributes('aria-pressed')).toBe('false')

    await wrapper.get('[data-test="select-b"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['b']])
  })
})
