import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useWaterRun, WATER_STEP_MS } from '../water'

describe('useWaterRun', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const water = () => effectScope().run(() => useWaterRun())!

  it('wets one cell per step and ends after the last', () => {
    const { wet, run } = water()
    const onEnd = vi.fn()

    run([4, 5, 6], onEnd)
    expect([...wet.value]).toEqual([])

    vi.advanceTimersByTime(WATER_STEP_MS)
    expect([...wet.value]).toEqual([4])

    vi.advanceTimersByTime(WATER_STEP_MS)
    expect([...wet.value]).toEqual([4, 5])
    expect(onEnd).not.toHaveBeenCalled()

    vi.advanceTimersByTime(WATER_STEP_MS)
    expect([...wet.value]).toEqual([4, 5, 6])
    expect(onEnd).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ends at once when there is nothing to wet', () => {
    const onEnd = vi.fn()

    water().run([], onEnd)

    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('stop halts the water and never ends', () => {
    const { wet, run, stop } = water()
    const onEnd = vi.fn()

    run([0, 1, 2], onEnd)
    vi.advanceTimersByTime(WATER_STEP_MS)
    stop()
    vi.advanceTimersByTime(10 * WATER_STEP_MS)

    expect([...wet.value]).toEqual([0])
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('a new run starts dry', () => {
    const { wet, run } = water()

    run([0, 1], () => {})
    vi.advanceTimersByTime(2 * WATER_STEP_MS)
    run([9], () => {})

    expect([...wet.value]).toEqual([])
  })

  it('fill wets everything at once and stops a run', () => {
    const { wet, run, fill } = water()
    const onEnd = vi.fn()

    run([0, 1, 2], onEnd)
    fill([5, 6])
    vi.advanceTimersByTime(10 * WATER_STEP_MS)

    expect([...wet.value]).toEqual([5, 6])
    expect(onEnd).not.toHaveBeenCalled()
  })
})
