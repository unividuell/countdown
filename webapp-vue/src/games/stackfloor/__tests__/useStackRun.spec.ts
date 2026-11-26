import { describe, expect, it } from 'vitest'
import type { RunClock } from '@/games/runClock'
import { buildTower, place, position, type TowerGeometry } from '../tower'
import { useStackRun } from '../useStackRun'

const G: TowerGeometry = {
  fieldWidth: 1000,
  startWidth: 660,
  speedNum: 1,
  speedDen: 2,
  accelPercent: 3,
  maxFloors: 999,
}
const PAUSE = 300

function setup(geometry: TowerGeometry = G) {
  let now = 0
  const clock: RunClock = {
    now: () => now,
    schedule: () => () => {},
    afterPaint: () => {},
  }
  const ends: number[][] = []
  const run = useStackRun({
    geometry,
    pauseMs: PAUSE,
    clock,
    onEnd: (clicks) => ends.push(clicks),
  })
  return {
    run,
    ends,
    at(ms: number) {
      now = ms
    },
  }
}

describe('useStackRun', () => {
  it('the slider sits where the clock carries it', () => {
    const { run, at } = setup()
    run.start(0)

    at(1000)
    run.frame()

    expect(run.slider.value).toEqual({ floor: 1, width: 660, x: position(G, 0, 660, 1000) })
  })

  it('a stop exactly on the bar below is perfect and cuts nothing', () => {
    const { run, at } = setup()
    run.start(0)

    // 340 ms at 1/2 unit per ms: x = 170, the foundation's own left edge.
    at(340)

    expect(run.tap()).toBe('perfect')
    expect(run.bars.value[1]).toEqual({ left: 170, width: 660 })
    expect(run.cuts.value).toEqual([])
  })

  it('a tap places the bar from its whole-millisecond time', () => {
    const { run, at, ends } = setup()
    run.start(0)

    at(680.4)
    run.frame()

    expect(run.tap()).toBe('placed')
    const expected = place(run.bars.value[0]!, position(G, 0, 660, 680), 660)!
    expect(run.bars.value[1]).toEqual(expected)
    expect(run.cuts.value).toEqual([
      { floor: 1, left: expected.left + expected.width, width: 660 - expected.width },
    ])
    expect(ends).toEqual([])
  })

  it('no slider in the pause: the next bar appears already moving', () => {
    const { run, at } = setup()
    run.start(0)
    at(100)
    run.tap()

    at(100 + PAUSE - 1)
    run.frame()
    expect(run.slider.value).toBeNull()

    at(100 + PAUSE + 40)
    run.frame()
    // Stopped at x 50 on the foundation (170..830): 540 rest on it.
    expect(run.slider.value).toEqual({ floor: 2, width: 540, x: position(G, 1, 540, 40) })
  })

  it('a start in the future shows no slider until it begins', () => {
    const { run, at } = setup()
    run.start(500)

    expect(run.slider.value).toBeNull()
    at(500)
    run.frame()
    expect(run.slider.value).not.toBeNull()
  })

  it('taps in the pause are ignored, then the next click counts from its end', () => {
    const { run, at, ends } = setup({ ...G, maxFloors: 2 })
    run.start(0)

    at(100)
    expect(run.tap()).toBe('placed')
    at(399)
    expect(run.tap()).toBe('ignored')

    at(400 + 50)
    expect(run.tap()).toBe('placed')
    expect(ends).toEqual([[100, 50]])
  })

  it('a background tab does not freeze the bar', () => {
    const { run, at, ends } = setup({ ...G, maxFloors: 1 })
    run.start(0)

    at(5000)
    expect(run.tap()).toBe('placed')

    expect(ends).toEqual([[5000]])
  })

  it('the miss ends the run with every click', () => {
    const { run, at, ends } = setup()
    run.start(0)

    at(0)
    expect(run.tap()).toBe('placed')
    at(300)
    expect(run.tap()).toBe('placed')
    at(600)
    expect(run.tap()).toBe('missed')

    expect(ends).toEqual([[0, 0, 0]])
    expect(buildTower(G, ends[0]!).bars).toEqual(run.bars.value)
    expect(run.ended.value).toBe(true)
    expect(run.slider.value).toBeNull()
    at(2000)
    expect(run.tap()).toBe('ignored')
    expect(ends).toHaveLength(1)
  })

  it('maxFloors ends the run without a miss', () => {
    const { run, at, ends } = setup({ ...G, maxFloors: 2 })
    run.start(0)

    at(0)
    run.tap()
    at(300)
    expect(run.tap()).toBe('placed')

    expect(ends).toEqual([[0, 0]])
    expect(run.ended.value).toBe(true)
  })
})
