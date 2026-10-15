import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlacePatchScoreboard from '@/games/placepatch/PlacePatchScoreboard.vue'
import type { ScoreRow } from '@/games/placepatch/scoreboard'

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    points: 0,
    provisional: false,
    tick: 0,
    correct: false,
    gaveUp: false,
    durationLabel: null,
    cell: { x: 1, y: 1 },
    ...over,
  }
}

describe('PlacePatchScoreboard', () => {
  it('says hit, miss or gave up per row', () => {
    const wrapper = mount(PlacePatchScoreboard, {
      props: {
        rows: [
          row({ userId: 'a', correct: true }),
          row({ userId: 'b' }),
          row({ userId: 'c', gaveUp: true, cell: null }),
        ],
        live: false,
        animate: false,
      },
    })

    expect(wrapper.get('[data-test="hit-a"]').text()).toBe('Treffer')
    expect(wrapper.get('[data-test="hit-b"]').text()).toBe('daneben')
    expect(wrapper.get('[data-test="hit-c"]').text()).toBe('aufgegeben')
  })

  it('shows the clock only for a timed round', () => {
    const timed = mount(PlacePatchScoreboard, {
      props: { rows: [row({ userId: 'a', durationLabel: '00:42' })], live: true, animate: false },
    })
    const untimed = mount(PlacePatchScoreboard, {
      props: { rows: [row({ userId: 'a' })], live: false, animate: false },
    })

    expect(timed.text()).toContain('[mm:ss]')
    expect(timed.text()).toContain('00:42')
    expect(untimed.text()).not.toContain('[mm:ss]')
  })
})
