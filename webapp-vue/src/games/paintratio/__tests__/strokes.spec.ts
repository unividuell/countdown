import { describe, expect, it } from 'vitest'
import { appendPoint, MIN_STEP, toUnits, usageOf } from '@/games/paintratio/strokes'
import type { Usage } from '@/games/paintratio/strokes'
import { COORDINATE_LIMIT, MAX_PATH, MAX_POINTS } from '@/games/paintratio/types'
import type { Stroke } from '@/games/paintratio/types'

const SIZE = { width: 1200, height: 900 }

describe('toUnits', () => {
  it('maps a pointer into canvas units, whatever the rendered size', () => {
    expect(toUnits(150, 75, { left: 0, top: 0, width: 300, height: 225 }, SIZE)).toEqual([600, 300])
    expect(toUnits(400, 200, { left: 100, top: 50, width: 600, height: 450 }, SIZE)).toEqual([
      600, 300,
    ])
  })

  it('rounds to whole units', () => {
    // 1 / 3 of a 1200 wide canvas shown 300 wide is 4 units a pixel: 1.1 px → 4.4 → 4
    expect(toUnits(1.1, 1.1, { left: 0, top: 0, width: 300, height: 225 }, SIZE)).toEqual([4, 4])
  })

  it('keeps units for a pointer outside the canvas', () => {
    expect(toUnits(-75, 450, { left: 0, top: 0, width: 300, height: 225 }, SIZE)).toEqual([
      -300, 1800,
    ])
  })

  it('refuses a rect without size', () => {
    expect(toUnits(1, 1, { left: 0, top: 0, width: 0, height: 0 }, SIZE)).toBeNull()
    expect(toUnits(1, 1, { left: 0, top: 0, width: 300, height: 0 }, SIZE)).toBeNull()
    expect(toUnits(1, 1, { left: 0, top: 0, width: 0, height: 225 }, SIZE)).toBeNull()
  })
})

const fresh = (usage: Partial<Usage> = {}): Usage => ({ points: 1, path: 0, ...usage })

describe('appendPoint', () => {
  it('thins points closer than two units to the last one kept', () => {
    const points = [100, 100]
    const usage = fresh()

    expect(MIN_STEP).toBe(2)
    expect(appendPoint(points, [101, 101], usage)).toBe(false)
    expect(appendPoint(points, [102, 100], usage)).toBe(true)
    expect(points).toEqual([100, 100, 102, 100])
  })

  it('measures from the last point kept, not from the last one offered', () => {
    const points = [100, 100]
    const usage = fresh()

    expect(appendPoint(points, [101, 100], usage)).toBe(false)
    expect(appendPoint(points, [102, 100], usage)).toBe(true)
    expect(appendPoint(points, [103, 100], usage)).toBe(false)
    expect(points).toEqual([100, 100, 102, 100])
  })

  it('keeps the first point of a stroke', () => {
    const points: number[] = []
    const usage = fresh({ points: 0 })

    expect(appendPoint(points, [100, 100], usage)).toBe(true)
    expect(points).toEqual([100, 100])
    expect(usage).toEqual({ points: 1, path: 0 })
  })

  it('counts every kept point and the Manhattan path to it', () => {
    const points = [100, 100]
    const usage = fresh()

    appendPoint(points, [130, 60], usage)
    appendPoint(points, [130, 100], usage)

    expect(usage).toEqual({ points: 3, path: 70 + 40 })
  })

  it('changes nothing for a refused point', () => {
    const points = [100, 100]
    const usage = fresh({ path: 5 })

    appendPoint(points, [101, 100], usage)
    appendPoint(points, [COORDINATE_LIMIT + 1, 100], usage)

    expect(points).toEqual([100, 100])
    expect(usage).toEqual({ points: 1, path: 5 })
  })

  it('drops points beyond the coordinate limit and continues on return', () => {
    const points = [1100, 450]
    const usage = fresh()

    expect(appendPoint(points, [10_001, 450], usage)).toBe(false)
    expect(appendPoint(points, [-10_001, 450], usage)).toBe(false)
    expect(appendPoint(points, [1100, 10_001], usage)).toBe(false)
    expect(appendPoint(points, [1100, -10_001], usage)).toBe(false)
    expect(appendPoint(points, [1150, 450], usage)).toBe(true)
    expect(points).toEqual([1100, 450, 1150, 450])
    expect(usage).toEqual({ points: 2, path: 50 })
  })

  it('drops a point that is not a number', () => {
    const points = [1100, 450]
    const usage = fresh()

    expect(appendPoint(points, [Number.NaN, 450], usage)).toBe(false)
    expect(appendPoint(points, [1100, Number.NaN], usage)).toBe(false)
    expect(points).toEqual([1100, 450])
    expect(usage).toEqual(fresh())
  })

  it('keeps a point on the coordinate limit', () => {
    const points = [9_900, 0]

    expect(appendPoint(points, [COORDINATE_LIMIT, 0], fresh())).toBe(true)
    expect(appendPoint(points, [COORDINATE_LIMIT, COORDINATE_LIMIT], fresh())).toBe(true)
  })

  it('refuses the first point of a stroke outside the limit', () => {
    const points: number[] = []

    expect(appendPoint(points, [COORDINATE_LIMIT + 1, 0], fresh({ points: 0 }))).toBe(false)
    expect(points).toEqual([])
  })

  it('stops at the point limit', () => {
    const points = [0, 0]

    expect(appendPoint(points, [10, 10], fresh({ points: MAX_POINTS }))).toBe(false)
    expect(appendPoint(points, [10, 10], fresh({ points: MAX_POINTS - 1 }))).toBe(true)
    expect(points).toEqual([0, 0, 10, 10])
  })

  it('stops at the path limit, to the unit', () => {
    const points = [0, 0]
    const usage = fresh({ points: 2, path: MAX_PATH - 10 })

    expect(appendPoint(points, [20, 0], usage)).toBe(false)
    expect(appendPoint(points, [5, 6], usage)).toBe(false)
    expect(usage).toEqual({ points: 2, path: MAX_PATH - 10 })

    expect(appendPoint(points, [5, 5], usage)).toBe(true)
    expect(usage).toEqual({ points: 3, path: MAX_PATH })
    expect(appendPoint(points, [5, 7], usage)).toBe(false)
  })
})

const stroke = (points: number[]): Stroke => ({ brush: 0, color: '#3049e8', points })

describe('usageOf', () => {
  it('is empty without strokes', () => {
    expect(usageOf([])).toEqual({ points: 0, path: 0 })
  })

  it('counts points over all strokes and sums |dx| + |dy| within each', () => {
    const strokes = [stroke([0, 0, 30, -40, 30, 0]), stroke([5, 5]), stroke([1000, 1000, 0, 0])]

    expect(usageOf(strokes)).toEqual({ points: 6, path: 70 + 40 + 2000 })
  })

  it('does not bridge the gap between two strokes', () => {
    expect(usageOf([stroke([0, 0]), stroke([500, 500])])).toEqual({ points: 2, path: 0 })
  })

  it('agrees with what appendPoint tallies', () => {
    const points: number[] = []
    const usage: Usage = { points: 0, path: 0 }

    for (const point of [
      [0, 0],
      [50, 20],
      [50, 80],
      [0, 80],
    ] as const) {
      appendPoint(points, point, usage)
    }

    expect(usageOf([stroke(points)])).toEqual(usage)
  })
})
