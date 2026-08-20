import { describe, expect, it } from 'vitest'
import { barFraction, stageMarks } from '../stagebar'

const DURATIONS = [0.1, 0.5, 2, 8, 15]

describe('stagebar', () => {
  it('maps time to the bar on a sqrt scale - the tiny first stages stay visible', () => {
    expect(barFraction(0, 15)).toBe(0)
    expect(barFraction(15, 15)).toBe(1)
    expect(barFraction(0.1, 15)).toBeCloseTo(Math.sqrt(0.1 / 15), 10)
    expect(barFraction(2, 15)).toBeCloseTo(Math.sqrt(2 / 15), 10)
  })

  it('clamps beyond the ends', () => {
    expect(barFraction(-1, 15)).toBe(0)
    expect(barFraction(20, 15)).toBe(1)
  })

  it('places one mark per stage boundary, on the same scale', () => {
    const marks = stageMarks(DURATIONS, 15)
    expect(marks).toHaveLength(5)
    expect(marks[0]).toBeCloseTo(Math.sqrt(0.1 / 15), 10)
    expect(marks[4]).toBe(1)
  })
})
