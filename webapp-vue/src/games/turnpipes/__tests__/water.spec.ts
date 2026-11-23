import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'
import { SPOILER_HOLD_MS } from '@/ui/resultsLanding'
import { TURN_MS } from '../turns'
import { useWaterRun, WATER_RUN_MS, waterStepMs } from '../water'

const STEP = 100

describe('the pace of the water', () => {
  it('fills a full board in the same time, whatever its size', () => {
    for (const size of [6, 7, 8]) expect(waterStepMs(size) * size * size).toBeCloseTo(WATER_RUN_MS)
  })

  // The roster waits for the verdict, which follows the water and its end sound; its ceiling must
  // not cut in. The longest end sound is dry.mp3, 3.7 s, then a 0.2 s breath.
  it('leaves room under the roster’s ceiling for the longest end sound and the verdict', () => {
    expect(SOLUTION_DELAY_MS + TURN_MS + WATER_RUN_MS + 3700 + 200).toBeLessThanOrEqual(
      SPOILER_HOLD_MS - 300,
    )
  })
})

describe('useWaterRun', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const water = () => effectScope().run(() => useWaterRun())!

  it('wets one cell per step and ends after the last', () => {
    const { wet, run } = water()
    const onEnd = vi.fn()

    run([4, 5, 6], onEnd, STEP)
    expect([...wet.value]).toEqual([])

    vi.advanceTimersByTime(STEP)
    expect([...wet.value]).toEqual([4])

    vi.advanceTimersByTime(STEP)
    expect([...wet.value]).toEqual([4, 5])
    expect(onEnd).not.toHaveBeenCalled()

    vi.advanceTimersByTime(STEP)
    expect([...wet.value]).toEqual([4, 5, 6])
    expect(onEnd).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ends at once when there is nothing to wet', () => {
    const onEnd = vi.fn()

    water().run([], onEnd, STEP)

    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('stop halts the water and never ends', () => {
    const { wet, run, stop } = water()
    const onEnd = vi.fn()

    run([0, 1, 2], onEnd, STEP)
    vi.advanceTimersByTime(STEP)
    stop()
    vi.advanceTimersByTime(10 * STEP)

    expect([...wet.value]).toEqual([0])
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('a new run starts dry', () => {
    const { wet, run } = water()

    run([0, 1], () => {}, STEP)
    vi.advanceTimersByTime(2 * STEP)
    run([9], () => {}, STEP)

    expect([...wet.value]).toEqual([])
  })

  it('fill wets everything at once and stops a run', () => {
    const { wet, run, fill } = water()
    const onEnd = vi.fn()

    run([0, 1, 2], onEnd, STEP)
    fill([5, 6])
    vi.advanceTimersByTime(10 * STEP)

    expect([...wet.value]).toEqual([5, 6])
    expect(onEnd).not.toHaveBeenCalled()
  })
})
