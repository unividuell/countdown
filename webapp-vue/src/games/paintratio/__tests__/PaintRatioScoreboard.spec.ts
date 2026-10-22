import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { KOLLEKTIV } from '@/games/paintratio/layers'
import PaintRatioScoreboard from '@/games/paintratio/PaintRatioScoreboard.vue'
import { formatDifference, formatPercent } from '@/games/paintratio/scoreboard'
import type { ScoreRow } from '@/games/paintratio/scoreboard'
import type { Stroke } from '@/games/paintratio/types'
import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'

enableAutoUnmount(afterEach)

const PAINTING: Stroke[] = [{ brush: 0, color: '#ff0000', points: [10, 10, 20, 20] }]

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#336699',
    ink: '#ffffff',
    points: 1,
    provisional: false,
    tick: 0,
    ratioLabel: '40,0 %',
    differenceLabel: '0,0 %',
    strokes: PAINTING,
    ...over,
  }
}

function mountBoard(rows: ScoreRow[], over: Record<string, unknown> = {}) {
  return mount(PaintRatioScoreboard, {
    props: {
      rows,
      live: false,
      animate: false,
      selected: [KOLLEKTIV],
      targetRatio: 0.4234,
      tolerance: 0.05,
      ...over,
    },
  })
}

describe('PaintRatioScoreboard', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('names the table and its columns', () => {
    const wrapper = mountBoard([row({ userId: 'a' })])

    expect(wrapper.get('caption').text()).toBe('Alle Gemälde der Runde, nach Abweichung sortiert')
    expect(wrapper.text()).toContain('Anteil')
    expect(wrapper.text()).toContain('Differenz')
  })

  it('puts the target share and, in phase one, the tolerance in the head', () => {
    const wrapper = mountBoard([row({ userId: 'a' })])

    expect(wrapper.get('#ratio-fact').text()).toBe(formatPercent(0.4234))
    expect(wrapper.get('#difference-fact').text()).toBe(`± ${formatPercent(0.05)}`)
  })

  it('has no tolerance in the head in phase two', () => {
    const wrapper = mountBoard([row({ userId: 'a' })], { tolerance: null })

    expect(wrapper.get('#ratio-fact').text()).toBe(formatPercent(0.4234))
    expect(wrapper.find('#difference-fact').exists()).toBe(false)
  })

  it('prints a row`s share and difference, a dash where there is none', () => {
    const wrapper = mountBoard([
      row({ userId: 'a', ratioLabel: '41,0 %', differenceLabel: '+1,0 %' }),
      row({ userId: 'b', ratioLabel: null, differenceLabel: null, strokes: null, points: null }),
    ])

    expect(wrapper.get('[data-test="cell-ratio-a"]').text()).toBe('41,0 %')
    expect(wrapper.get('[data-test="cell-difference-a"]').text()).toBe('+1,0 %')
    expect(wrapper.get('[data-test="cell-ratio-b"]').text()).toBe('—')
    expect(wrapper.get('[data-test="cell-difference-b"]').text()).toBe('—')
  })

  it('turns a name into a button that says whether its painting lies on the picture', async () => {
    const wrapper = mountBoard([row({ userId: 'a' }), row({ userId: 'b' })], {
      selected: [KOLLEKTIV, 'a'],
    })

    expect(wrapper.get('[data-test="select-a"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-test="select-b"]').attributes('aria-pressed')).toBe('false')

    await wrapper.get('[data-test="select-b"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['b']])
  })

  it('leaves the name of a row without strokes as plain text', () => {
    const wrapper = mountBoard([row({ userId: 'gone', name: 'Gerd', strokes: null })])

    expect(wrapper.find('[data-test="select-gone"]').exists()).toBe(false)
    expect(wrapper.get('th[scope="row"]').text()).toBe('Gerd')
  })

  describe('the Kollektiv Kommune beneath the table', () => {
    it('shows the target share, no difference and no points', () => {
      const wrapper = mountBoard([row({ userId: 'a' })])
      const kollektiv = wrapper.get('[data-test="paint-ratio-kollektiv"]')

      expect(kollektiv.text()).toContain('Kollektiv Kommune')
      expect(kollektiv.text()).toContain(formatPercent(0.4234))
      expect(kollektiv.text()).toContain(formatDifference(0))
      expect(kollektiv.text()).toContain('—')
      expect(wrapper.find('hr').exists()).toBe(true)
    })

    it('is a button that says whether the picture lies on the canvas', async () => {
      const lying = mountBoard([row({ userId: 'a' })])
      const lifted = mountBoard([row({ userId: 'a' })], { selected: ['a'] })

      expect(lying.get('[data-test="select-kollektiv"]').attributes('aria-pressed')).toBe('true')
      expect(lifted.get('[data-test="select-kollektiv"]').attributes('aria-pressed')).toBe('false')

      await lifted.get('[data-test="select-kollektiv"]').trigger('click')

      expect(lifted.emitted('select')).toEqual([[KOLLEKTIV]])
    })

    it('keeps the table`s columns, the clock included when the table has one', () => {
      const untimed = mountBoard([row({ userId: 'a' })])
      const timed = mountBoard([row({ userId: 'a', durationLabel: '00:42' })])
      const shape = (w: ReturnType<typeof mountBoard>) => {
        const footer = w.get<HTMLElement>('[data-test="paint-ratio-kollektiv"]')

        return [
          w.findAll('[data-test="scoreboard"] col').length,
          footer.element.children.length,
          footer.element.style.gridTemplateColumns,
        ]
      }

      // The table's `<col>`s are „Name“, the game's two, the clock if any, „Pkt“ — one cell each.
      expect(shape(untimed)).toEqual([4, 4, 'minmax(0, 1fr) 3.5rem 4rem 2rem'])
      expect(shape(timed)).toEqual([5, 5, 'minmax(0, 1fr) 3.5rem 4rem 3.5rem 2rem'])
    })

    it('appears with the head, when the solution does', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)

      const moving = mountBoard([row({ userId: 'a' })], { animate: true })
      const still = mountBoard([row({ userId: 'a' })])
      const footer = (w: ReturnType<typeof mountBoard>) =>
        w.get<HTMLElement>('[data-test="paint-ratio-kollektiv"]')

      expect(footer(moving).classes()).toContain('opacity-0')
      expect(footer(still).classes()).toContain('opacity-100')

      vi.advanceTimersByTime(100)
      await nextTick()

      expect(footer(moving).classes()).toContain('opacity-100')
      expect(footer(moving).element.style.transitionDelay).toBe(`${SOLUTION_DELAY_MS}ms`)
    })
  })
})
