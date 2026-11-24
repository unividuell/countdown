import { describe, expect, it } from 'vitest'
import { wedgeMid, wedgePath, wedges } from '../pie'

describe('wedges', () => {
  it('shares the circle by weight, one after the other from the start', () => {
    expect(wedges([1, 1, 0.5], 23)).toEqual([
      { from: 23, sweep: 144 },
      { from: 167, sweep: 144 },
      { from: 311, sweep: 72 },
    ])
  })

  it('gives nothing when every weight is zero', () => {
    expect(wedges([0, 0], 23).map((wedge) => wedge.sweep)).toEqual([0, 0])
  })
})

describe('wedgePath', () => {
  it('runs from the centre along its arc', () => {
    expect(wedgePath({ from: 0, sweep: 90 }, 10)).toBe(
      'M0 0L10.000 0.000A10 10 0 0 1 0.000 10.000Z',
    )
  })

  it('takes the long way round past half', () => {
    expect(wedgePath({ from: 0, sweep: 270 }, 10)).toContain('A10 10 0 1 1')
  })

  it('draws a whole circle as two half arcs', () => {
    expect(wedgePath({ from: 23, sweep: 360 }, 10)).toBe(
      'M10 0A10 10 0 1 1 -10 0A10 10 0 1 1 10 0Z',
    )
  })
})

describe('wedgeMid', () => {
  it('sits on the middle angle', () => {
    const { x, y } = wedgeMid({ from: 0, sweep: 90 }, 10)

    expect(x).toBeCloseTo(7.071, 3)
    expect(y).toBeCloseTo(7.071, 3)
  })
})
