import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { testTimeline } from '@/games/__tests__/timelineTiming'
import type { ScoreRow } from '../scoreboard'
import StackFloorScoreboard from '../StackFloorScoreboard.vue'

const ROW: ScoreRow = {
  userId: 'u1',
  name: 'Anna',
  colorHex: '#2563eb',
  ink: '#ffffff',
  points: 1,
  provisional: false,
  durationLabel: null,
  tick: 0,
  height: 14,
  marks: [],
  clicks: [0],
}

function mountBoard(target: number | null) {
  return mount(StackFloorScoreboard, {
    global: { provide: testTimeline(false).provide },
    props: { rows: [ROW], live: false, selectedUserId: null, target },
  })
}

describe('StackFloorScoreboard', () => {
  it('phase one names the solution in the head: at least the target', () => {
    expect(mountBoard(12).get('[data-test="stack-floor-solution"]').text()).toBe('≥ 12')
  })

  it('phase two has no solution', () => {
    expect(mountBoard(null).find('[data-test="stack-floor-solution"]').exists()).toBe(false)
  })

  it('the height is the bare number, right-aligned', () => {
    const cell = mountBoard(12)
      .findAll('td')
      .find((td) => td.text() === '14')

    expect(cell?.classes()).toContain('text-end')
  })
})
