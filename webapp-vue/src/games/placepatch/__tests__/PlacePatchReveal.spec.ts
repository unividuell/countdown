import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { TIP_COLUMN, VERDICT_MS, othersDelayMs } from '@/games/revealChoreography'
import PlacePatchReveal from '@/games/placepatch/PlacePatchReveal.vue'
import type { ScoreRow } from '@/games/placepatch/scoreboard'
import { TIMELINE_TIMERS, VERDICT_AT_MS } from '@/games/__tests__/timelineTiming'
import { playVerdict } from '@/ui/verdictSound'
import { soundOnStage } from '@/ui/useSoundAwake'
import { expectJudgesWithVerdict } from '@/games/__tests__/judgesWithVerdict'

const stopVerdict = vi.fn()
vi.mock('@/ui/verdictSound', () => ({ playVerdict: vi.fn(() => ({ stop: stopVerdict })) }))

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

function mountReveal(rows: ScoreRow[], animate = false, won: boolean | null = null) {
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
      won,
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
      vi.useFakeTimers({ toFake: TIMELINE_TIMERS })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('fades the solution in with the verdict, the other tips after it, and never mine', async () => {
      const wrapper = mountReveal(
        [
          row({ userId: 'fry', cell: { x: 1, y: 1 }, tick: 1 }),
          row({ userId: 'mine', cell: { x: 7, y: 4 }, tick: 0 }),
        ],
        true,
      )
      const solution = () => wrapper.get('[data-test="place-patch-solution"]')
      const fry = () => wrapper.get('[data-test="place-patch-outline-fry"]').attributes('style')
      const mine = () => wrapper.get('[data-test="place-patch-outline-mine"]').attributes('style')

      expect(mine()).toContain('opacity: 1')
      vi.advanceTimersByTime(VERDICT_AT_MS - 50)
      await wrapper.vm.$nextTick()
      expect(solution().classes()).toContain('opacity-0')

      vi.advanceTimersByTime(50)
      await wrapper.vm.$nextTick()
      expect(solution().classes()).toContain('opacity-100')
      expect(fry()).toContain('opacity: 0')

      vi.advanceTimersByTime(VERDICT_MS)
      await wrapper.vm.$nextTick()
      expect(fry()).toContain('opacity: 1')
      expect(fry()).toContain(`${othersDelayMs(1, TIP_COLUMN, 2)}ms`)
    })
  })

  describe('verdict', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: TIMELINE_TIMERS })
      vi.mocked(playVerdict).mockClear()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('plays mine at the verdict', () => {
      mountReveal([row({ userId: 'mine' })], true, false)
      vi.advanceTimersByTime(VERDICT_AT_MS - 50)
      expect(playVerdict).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)

      expect(playVerdict).toHaveBeenCalledExactlyOnceWith(false)
    })

    it('stays silent on a reload into a round already revealed', () => {
      mountReveal([row({ userId: 'mine' })], false, true)
      vi.advanceTimersByTime(VERDICT_AT_MS)

      expect(playVerdict).not.toHaveBeenCalled()
    })

    it('asks the header to wake the graph while here', () => {
      mountReveal([])

      expect(soundOnStage.value).toBe(true)
    })
  })

  // The rule every reveal keeps — see `judgesWithVerdict`.
  it('judges with its verdict: the solution lands with my row and its sound', async () => {
    vi.useFakeTimers({ toFake: [...TIMELINE_TIMERS, 'setInterval', 'clearInterval'] })
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList)
    try {
      await expectJudgesWithVerdict({
        mount: () =>
          mountReveal(
            [
              row({ userId: 'other', cell: { x: 1, y: 1 }, tick: 1 }),
              row({ userId: 'mine', cell: { x: 7, y: 4 }, tick: 0 }),
            ],
            true,
            true,
          ),
        mineUserId: 'mine',
        judging: (w) => w.get('[data-test="place-patch-solution"]').classes('opacity-100'),
        verdict: 'sound',
      })
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })
})
