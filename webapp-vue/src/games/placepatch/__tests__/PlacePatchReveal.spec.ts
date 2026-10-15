import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { SOLUTION_DELAY_MS, TIP_COLUMN, cellDelayMs } from '@/games/revealChoreography'
import PlacePatchReveal from '@/games/placepatch/PlacePatchReveal.vue'
import type { ScoreRow } from '@/games/placepatch/scoreboard'

const PAYLOAD = { cols: 40, rows: 30, size: 10 }

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    points: 0,
    provisional: false,
    tick: 0,
    correct: false,
    durationLabel: null,
    cell: null,
    ...over,
  }
}

function mountReveal(rows: ScoreRow[], animate = false) {
  return mount(PlacePatchReveal, {
    props: {
      payload: PAYLOAD,
      solution: { x: 7, y: 4 },
      rows,
      mineUserId: 'mine',
      live: false,
      animate,
      boardSrc: '/assets/0',
      patchSrc: '/assets/1',
    },
  })
}

describe('PlacePatchReveal', () => {
  it('sets the coloured patch into its place on the grey board', () => {
    const wrapper = mountReveal([])

    const solution = wrapper.get('[data-test="place-patch-solution"]')
    expect(solution.attributes('style')).toMatch(/left: 17\.5%/)
    expect(solution.get('img').attributes('src')).toBe('/assets/1')
  })

  it('marks the target with a small X at the centre and its corners just outside', () => {
    const solution = mountReveal([]).get('[data-test="place-patch-solution"]')
    const segments = solution
      .findAll('line')
      .map((line) => ['x1', 'y1', 'x2', 'y2'].map((name) => Number(line.attributes(name))))
    const corners = solution.findAll('[data-test="place-patch-target-corner"]')

    expect(segments).toEqual([
      [42, 42, 58, 58],
      [58, 42, 42, 58],
    ])
    // Offset outwards by their own line width: a hit's box touches them, no box covers them.
    expect(
      corners.map((corner) => corner.classes().filter((name) => name.startsWith('-'))),
    ).toEqual([
      ['-top-0.5', '-left-0.5'],
      ['-top-0.5', '-right-0.5'],
      ['-bottom-0.5', '-left-0.5'],
      ['-bottom-0.5', '-right-0.5'],
    ])
  })

  it('stacks the tips, mine outermost', () => {
    const wrapper = mountReveal([
      row({ userId: 'fry', cell: { x: 7, y: 4 }, colorHex: '#16a34a' }),
      row({ userId: 'mine', cell: { x: 7, y: 4 } }),
      row({ userId: 'gave-up' }),
    ])

    expect(wrapper.get('[data-test="place-patch-outline-mine"]').attributes('data-inset')).toBe('0')
    expect(wrapper.get('[data-test="place-patch-outline-fry"]').attributes('data-inset')).toBe('2')
    expect(wrapper.find('[data-test="place-patch-outline-gave-up"]').exists()).toBe(false)
  })

  it('draws the board at the size the playing board has', () => {
    const wrapper = mountReveal([])

    const field = wrapper.get('img').element.parentElement!
    expect(field.className).toContain('-mx-4')
    expect(field.className).toContain('-mt-4')
    expect(field.getAttribute('style')).toContain('aspect-ratio: 40 / 30')
  })

  it('moves a tip that shares a cell inwards, by its inset', () => {
    const wrapper = mountReveal([
      row({ userId: 'mine', cell: { x: 7, y: 4 } }),
      row({ userId: 'fry', cell: { x: 7, y: 4 } }),
    ])

    expect(wrapper.get('[data-test="place-patch-outline-mine"]').attributes('style')).toContain(
      'left: 17.5%',
    )
    expect(wrapper.get('[data-test="place-patch-outline-fry"]').attributes('style')).toContain(
      'left: calc(17.5% + 2px)',
    )
  })

  describe('as a live reveal', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('fades the solution and the other tips in, and never mine', async () => {
      const wrapper = mountReveal(
        [
          row({ userId: 'fry', cell: { x: 1, y: 1 }, tick: 0 }),
          row({ userId: 'mine', cell: { x: 7, y: 4 }, tick: 1 }),
        ],
        true,
      )
      const solution = wrapper.get('[data-test="place-patch-solution"]')
      const fry = wrapper.get('[data-test="place-patch-outline-fry"]')
      const mine = wrapper.get('[data-test="place-patch-outline-mine"]')

      expect(solution.classes()).toContain('opacity-0')
      expect(solution.attributes('style')).toContain(`transition-delay: ${SOLUTION_DELAY_MS}ms`)
      expect(fry.attributes('style')).toContain('opacity: 0')
      expect(fry.attributes('style')).toContain(`${cellDelayMs(0, TIP_COLUMN, 2)}ms`)
      expect(mine.attributes('style')).toContain('opacity: 1')

      vi.advanceTimersByTime(50)
      await wrapper.vm.$nextTick()

      expect(solution.classes()).toContain('opacity-100')
      expect(fry.attributes('style')).toContain('opacity: 1')
    })
  })
})
