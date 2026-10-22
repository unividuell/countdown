import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import type { GameEntry } from '@/games/GameEntry'
import LayerCanvas from '@/games/paintratio/LayerCanvas.vue'
import PaintRatioReveal from '@/games/paintratio/PaintRatioReveal.vue'
import type { CanvasLayer } from '@/games/paintratio/render'
import { formatPercent, scoreRows } from '@/games/paintratio/scoreboard'
import type { PaintRatioPayload, PaintRatioSolution, Stroke } from '@/games/paintratio/types'
import { FADE_MS, SOLUTION_DELAY_MS } from '@/games/revealChoreography'

enableAutoUnmount(afterEach)

const PAYLOAD: PaintRatioPayload = {
  width: 1200,
  height: 900,
  brushes: [40, 80, 160],
  tolerance: 0.05,
}
const SOLUTION: PaintRatioSolution = { targetRatio: 0.4234, tolerance: 0.05 }

const painting = (x: number): Stroke[] => [{ brush: 0, color: '#ff0000', points: [x, x, x, x + 9] }]
const MINE = painting(10)
const ANNA = painting(20)
const BERT = painting(30)

const PAINTINGS: Record<string, Stroke[]> = { me: MINE, anna: ANNA, bert: BERT }

/** A judged entry, its distance from the target as given. */
function entry(userId: string, difference: number, over: Partial<GameEntry> = {}): GameEntry {
  return gameEntry({
    userId,
    guess: { strokes: PAINTINGS[userId] ?? painting(40) },
    outcome: { ratio: 0.4234 + difference, difference, withinTolerance: true },
    points: 1,
    ...over,
  })
}

const ENTRIES = [entry('me', 0.001), entry('anna', 0.01), entry('bert', 0.02)]

function mountReveal(over: { entries?: GameEntry[] } & Record<string, unknown> = {}) {
  const { entries = ENTRIES, ...props } = over
  const mineUserId = 'mineUserId' in props ? (props['mineUserId'] as string | null) : 'me'

  return mount(PaintRatioReveal, {
    props: {
      payload: PAYLOAD,
      solution: SOLUTION,
      templateSrc: 'blob:template',
      rows: scoreRows({
        entries,
        awardRule: 'ALL_QUALIFYING',
        mineUserId,
        brushCount: PAYLOAD.brushes.length,
      }),
      live: false,
      animate: false,
      mineUserId,
      ...props,
    },
  })
}

type Reveal = ReturnType<typeof mountReveal>

const canvases = (w: Reveal) => w.findAllComponents(LayerCanvas)
const layersOf = (w: Reveal, at: number): CanvasLayer[] => canvases(w)[at]!.props('layers')
const TEMPLATE: CanvasLayer = { kind: 'template' }
const strokes = (list: Stroke[]): CanvasLayer => ({ kind: 'strokes', strokes: list })

/** Taps like a finger: awaiting lets the layers settle. */
async function tap(w: Reveal, id: string) {
  await w.get(`[data-test="select-${id}"]`).trigger('click')
}

function useBeats() {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
}

describe('PaintRatioReveal', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the target ratio and, in phase one, the tolerance in the head', () => {
    const one = mountReveal()

    expect(one.get('#ratio-fact').text()).toBe(formatPercent(0.4234))
    expect(one.get('#difference-fact').text()).toBe(`± ${formatPercent(0.05)}`)

    const two = mountReveal({
      payload: { ...PAYLOAD, tolerance: null },
      solution: { targetRatio: 0.4234, tolerance: null },
    })

    expect(two.get('#ratio-fact').text()).toBe(formatPercent(0.4234))
    expect(two.find('#difference-fact').exists()).toBe(false)
  })

  it('starts on the Kollektiv`s picture after a reload', () => {
    const wrapper = mountReveal()

    expect(canvases(wrapper)).toHaveLength(1)
    expect(layersOf(wrapper, 0)).toEqual([TEMPLATE])
    expect(canvases(wrapper)[0]!.props('templateSrc')).toBe('blob:template')
    expect(wrapper.find('[data-test="paint-ratio-own"]').exists()).toBe(false)
  })

  describe('with animation', () => {
    const style = (w: Reveal) => w.get<HTMLElement>('[data-test="paint-ratio-own"]').element.style

    it('keeps the own painting, then fades to the picture at SOLUTION_DELAY_MS', async () => {
      useBeats()
      const wrapper = mountReveal({ animate: true })

      // My painting lies over the picture, which waits underneath.
      expect(canvases(wrapper)).toHaveLength(2)
      expect(layersOf(wrapper, 0)).toEqual([TEMPLATE])
      expect(layersOf(wrapper, 1)).toEqual([strokes(MINE)])
      expect(style(wrapper).opacity).toBe('1')

      vi.advanceTimersByTime(SOLUTION_DELAY_MS - 100)
      await nextTick()
      expect(style(wrapper).opacity).toBe('1')

      vi.advanceTimersByTime(200)
      await nextTick()
      expect(style(wrapper).opacity).toBe('0')
      expect(style(wrapper).transitionDuration).toBe(`${FADE_MS}ms`)
    })

    it('has nothing to fade from without a painting of its own', () => {
      useBeats()
      const wrapper = mountReveal({ animate: true, mineUserId: null })

      expect(canvases(wrapper)).toHaveLength(1)
      expect(layersOf(wrapper, 0)).toEqual([TEMPLATE])
    })

    it('has nothing to fade from when my painting is unreadable', () => {
      useBeats()
      const wrapper = mountReveal({
        animate: true,
        entries: [entry('me', 0.001, { guess: { strokes: [{ brush: 9 }] } }), ENTRIES[1]!],
      })

      expect(canvases(wrapper)).toHaveLength(1)
    })

    it('starts no beat that outlives it', () => {
      useBeats()
      const wrapper = mountReveal({ animate: true })

      // Past the arming frames, the solution beat is waiting.
      vi.advanceTimersByTime(100)
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      wrapper.unmount()

      expect(vi.getTimerCount()).toBe(0)
    })

    it('shows the picture at once under reduced motion', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)

      const wrapper = mountReveal({ animate: true })

      expect(canvases(wrapper)).toHaveLength(1)
      expect(layersOf(wrapper, 0)).toEqual([TEMPLATE])
    })
  })

  it('lays a painting over the picture when its name is tapped, in tap order', async () => {
    const wrapper = mountReveal()

    await tap(wrapper, 'bert')
    expect(layersOf(wrapper, 0)).toEqual([TEMPLATE, strokes(BERT)])

    await tap(wrapper, 'anna')
    expect(layersOf(wrapper, 0)).toEqual([TEMPLATE, strokes(BERT), strokes(ANNA)])

    await tap(wrapper, 'bert')
    expect(layersOf(wrapper, 0)).toEqual([TEMPLATE, strokes(ANNA)])
  })

  it('switches the picture itself from the Kollektiv Kommune row', async () => {
    const wrapper = mountReveal()

    await tap(wrapper, 'anna')
    await wrapper.get('[data-test="select-kollektiv"]').trigger('click')
    expect(layersOf(wrapper, 0)).toEqual([strokes(ANNA)])

    await wrapper.get('[data-test="select-kollektiv"]').trigger('click')
    expect(layersOf(wrapper, 0)).toEqual([strokes(ANNA), TEMPLATE])
  })

  it('offers no button for a row without strokes', () => {
    const wrapper = mountReveal({
      entries: [
        ...ENTRIES,
        entry('gave-up', 0, { guess: null, outcome: null, points: 0 }),
        entry('junk-strokes', 0.03, { guess: { strokes: [{ brush: 9 }] } }),
        entry('junk-outcome', 0, { outcome: { ratio: 'x' } }),
      ],
    })

    const names = wrapper.findAll('th[scope="row"]').map((th) => th.text())
    expect(names).toEqual(['me', 'anna', 'bert', 'junk-strokes', 'gave-up', 'junk-outcome'])
    expect(wrapper.find('[data-test="select-anna"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="select-gave-up"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="select-junk-strokes"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="select-junk-outcome"]').exists()).toBe(false)
  })

  it('skips a selected painting whose row has gone', async () => {
    const wrapper = mountReveal()
    await tap(wrapper, 'anna')

    await wrapper.setProps({
      rows: scoreRows({
        entries: [ENTRIES[0]!, ENTRIES[2]!],
        awardRule: 'ALL_QUALIFYING',
        mineUserId: 'me',
        brushCount: 3,
      }),
    })

    expect(layersOf(wrapper, 0)).toEqual([TEMPLATE])
  })
})
