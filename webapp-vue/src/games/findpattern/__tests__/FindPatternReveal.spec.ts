import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternReveal from '@/games/findpattern/FindPatternReveal.vue'
import { TIP_COLUMN, cellDelayMs } from '@/games/revealChoreography'
import type { ScoreRow } from '@/games/findpattern/scoreboard'
import type { FindPatternPayload, FindPatternSolution } from '@/games/findpattern/types'

const PAYLOAD: FindPatternPayload = {
  cols: 8,
  rows: 14,
  patternLength: 4,
  boardImage: 'data:image/png;base64,AAA',
  patternImage: 'data:image/png;base64,BBB',
}

const SOLUTION: FindPatternSolution = {
  blocks: Array.from({ length: 112 }, (_, index) => index % 4),
  pattern: [1, 2, 3, 0],
  palette: ['#ffffff', '#cccccc', '#999999', '#666666'],
  delta: 0.14,
  startIndices: [1, 5],
}

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    chips: [],
    correct: true,
    gaveUp: false,
    durationLabel: null,
    points: 1,
    provisional: false,
    startIndex: 5,
    tick: 0,
    ...over,
  }
}

function mountReveal(
  rows: ScoreRow[],
  overrides: Partial<InstanceType<typeof FindPatternReveal>['$props']> = {},
) {
  return mount(FindPatternReveal, {
    props: {
      payload: PAYLOAD,
      solution: SOLUTION,
      rows,
      mineUserId: 'mine',
      live: false,
      animate: false,
      ...overrides,
    },
  })
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('FindPatternReveal', () => {
  afterEach(() => {
    setHidden(false)
    vi.restoreAllMocks()
  })

  it('lights the tone index of every cell that belongs to a possibility', () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    // startIndices 1 and 5, four cells each.
    expect(wrapper.findAll('[data-test^="pattern-number-"]')).toHaveLength(8)
    expect(wrapper.get('[data-test="pattern-number-1"]').text()).toBe('1')
    expect(wrapper.find('[data-test="pattern-number-40"]').exists()).toBe(false)
  })

  it('lets any cell be inspected and put away again', async () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    await wrapper.get('[data-test="pattern-cell-40"]').trigger('click')
    expect(wrapper.get('[data-test="pattern-number-40"]').text()).toBe('0')

    await wrapper.get('[data-test="pattern-cell-40"]').trigger('click')
    expect(wrapper.find('[data-test="pattern-number-40"]').exists()).toBe(false)
  })

  it('lets a possibility be switched off, like any other cell', async () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    await wrapper.get('[data-test="pattern-cell-1"]').trigger('click')

    expect(wrapper.find('[data-test="pattern-number-1"]').exists()).toBe(false)
  })

  it('draws my own tip outermost and the others inside it', () => {
    const wrapper = mountReveal([
      row({ userId: 'other', colorHex: '#00ff00', startIndex: 5 }),
      row({ userId: 'mine', colorHex: '#ff0000', startIndex: 5 }),
    ])

    const outlines = wrapper.findAll('[data-test="pattern-outline-5"]')
    expect(outlines).toHaveLength(2)
    expect(outlines[0]!.attributes('style')).toContain('#ff0000')
    expect(outlines[0]!.attributes('style')).toContain('top: 0px')
    expect(outlines[1]!.attributes('style')).toContain('#00ff00')
    expect(outlines[1]!.attributes('style')).toContain('top: 2px')
  })

  it('shows the palette with its indices and the round’s delta', () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    const tones = wrapper.findAll('[data-test="palette-tone"]')
    expect(tones).toHaveLength(4)
    expect(tones.map((tone) => tone.text())).toEqual(['0', '1', '2', '3'])
    expect(wrapper.get('[data-test="palette-delta"]').text()).toContain('0,14')
  })

  it('adapts each palette swatch’s ink to its own tone', () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    const tones = wrapper.findAll<HTMLElement>('[data-test="palette-tone"]')
    // White (#ffffff) reads dark, near-black (#666666) reads light — not the same ink throughout.
    expect(tones[0]!.element.style.color).not.toBe(tones[3]!.element.style.color)
  })

  it('carries the scoreboard, wired to the same rows, solution and settings', () => {
    const wrapper = mountReveal(
      [row({ userId: 'mine' }), row({ userId: 'other', points: 0, correct: false })],
      { live: true, animate: true },
    )

    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.find('[data-test="tip-mine"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="solution-chip"]').map((chip) => chip.text())).toEqual(
      SOLUTION.pattern.map(String),
    )
    expect(wrapper.find('[data-test="pattern-scoreboard-live"]').exists()).toBe(true)
    // `animate` reaches the scoreboard too — it has not had its own chance to fade in yet.
    expect(wrapper.get('tbody td').classes()).toContain('opacity-0')
  })

  it('does not show the search pattern image again', () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    const sources = wrapper.findAll('img').map((img) => img.attributes('src'))
    expect(sources).not.toContain(PAYLOAD.patternImage)
  })

  it('is fully drawn at once when it is not a live reveal', () => {
    const wrapper = mountReveal([
      row({ userId: 'other', colorHex: '#00ff00', startIndex: 5, tick: 0 }),
      row({ userId: 'mine', colorHex: '#ff0000', startIndex: 5, tick: 1 }),
    ])

    for (const outline of wrapper.findAll('[data-test="pattern-outline-5"]')) {
      expect(outline.attributes('style')).toContain('transition-delay: 0ms')
    }
    expect(wrapper.get('[data-test="pattern-palette"]').classes()).toContain('opacity-100')
  })

  describe('as a live reveal', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
      setHidden(false)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("stages every other player's outline on its own row's beat", () => {
      const wrapper = mountReveal(
        [
          row({ userId: 'other', colorHex: '#00ff00', startIndex: 5, tick: 1 }),
          row({ userId: 'mine', colorHex: '#ff0000', startIndex: 5, tick: 0 }),
        ],
        { animate: true },
      )

      const outlines = wrapper.findAll('[data-test="pattern-outline-5"]')
      expect(outlines[0]!.attributes('style')).toContain('transition-delay: 0ms')
      expect(outlines[1]!.attributes('style')).toContain(
        `transition-delay: ${cellDelayMs(1, TIP_COLUMN, 2)}ms`,
      )
    })

    it("keeps every other player's outline hidden until the beats begin, mine never hidden", async () => {
      const wrapper = mountReveal(
        [
          row({ userId: 'other', colorHex: '#00ff00', startIndex: 5, tick: 1 }),
          row({ userId: 'mine', colorHex: '#ff0000', startIndex: 5, tick: 0 }),
        ],
        { animate: true },
      )

      const [mine, other] = wrapper.findAll('[data-test="pattern-outline-5"]')
      expect(mine!.classes()).toContain('opacity-100')
      expect(other!.classes()).toContain('opacity-0')

      vi.advanceTimersByTime(50)
      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('[data-test="pattern-outline-5"]')[1]!.classes()).toContain(
        'opacity-100',
      )
    })

    it('starts the possibilities hidden, then lights them on beat 3', async () => {
      const wrapper = mountReveal([row({ userId: 'mine' })], { animate: true })

      expect(wrapper.get('[data-test="pattern-number-1"]').classes()).toContain('opacity-0')

      vi.advanceTimersByTime(50)
      await wrapper.vm.$nextTick()

      expect(wrapper.get('[data-test="pattern-number-1"]').classes()).toContain('opacity-100')
    })

    it('starts the palette hidden, then fades it in on beat 3', async () => {
      const wrapper = mountReveal([row({ userId: 'mine' })], { animate: true })

      expect(wrapper.get('[data-test="pattern-palette"]').classes()).toContain('opacity-0')

      vi.advanceTimersByTime(50)
      await wrapper.vm.$nextTick()

      expect(wrapper.get('[data-test="pattern-palette"]').classes()).toContain('opacity-100')
    })

    it('skips straight to the end under reduced motion', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)

      const wrapper = mountReveal(
        [
          row({ userId: 'other', colorHex: '#00ff00', startIndex: 5, tick: 1 }),
          row({ userId: 'mine', colorHex: '#ff0000', startIndex: 5, tick: 0 }),
        ],
        { animate: true },
      )

      expect(wrapper.get('[data-test="pattern-palette"]').classes()).toContain('opacity-100')
      for (const outline of wrapper.findAll('[data-test="pattern-outline-5"]')) {
        expect(outline.attributes('style')).toContain('transition-delay: 0ms')
      }
    })

    it('skips straight to the end in a background tab', () => {
      setHidden(true)

      const wrapper = mountReveal([row({ userId: 'mine' })], { animate: true })

      expect(wrapper.get('[data-test="pattern-palette"]').classes()).toContain('opacity-100')
    })
  })
})
