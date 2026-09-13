import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SpotObjectScoreboard from '../SpotObjectScoreboard.vue'
import type { ScoreRow } from '../tips'

// The table itself — band, gutters, cascade, live chip, the pulse's nesting — is
// `RevealScoreboard`'s and tested there. Weltanschauung brings the least of any game: its tip is a
// photo shown above the card, so all this file decides is the clock column.

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    durationLabel: null,
    points: 1,
    provisional: false,
    tick: 0,
    ...over,
  }
}

function mountBoard(props: Partial<InstanceType<typeof SpotObjectScoreboard>['$props']> = {}) {
  return mount(SpotObjectScoreboard, {
    props: {
      rows: [row({ userId: 'a' })],
      live: false,
      animate: false,
      ...props,
    },
  })
}

describe('SpotObjectScoreboard', () => {
  it('shows one row per player', () => {
    const wrapper = mountBoard({
      rows: [row({ userId: 'a' }), row({ userId: 'b', points: 0 })],
    })

    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('narrows to Name and Pkt in an untimed round — there is no tip to show', () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a' })] })

    expect(wrapper.findAll('thead tr:last-child th').map((th) => th.text())).toEqual([
      'Name',
      'Pkt',
    ])
  })

  it('shows the clock column as soon as a row has a duration', () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a', durationLabel: '00:42' })] })

    expect(wrapper.findAll('thead tr:last-child th').map((th) => th.text())).toEqual([
      'Name',
      '[mm:ss]',
      'Pkt',
    ])
    expect(wrapper.text()).toContain('00:42')
  })

  it('says „no clock“ with an em dash for a row the round could not time', () => {
    const wrapper = mountBoard({
      rows: [row({ userId: 'a', durationLabel: '00:42' }), row({ userId: 'b' })],
    })

    expect(wrapper.get('[data-test="cell-clock-b"]').text()).toBe('—')
  })

  it('brings no solution block — the photo above the card is the solution', () => {
    expect(mountBoard().text()).not.toContain('Lösung')
  })
})
