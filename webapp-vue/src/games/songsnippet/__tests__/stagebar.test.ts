import { describe, expect, it } from 'vitest'
import {
  barFraction,
  ladderShare,
  scaleEndLabel,
  secondsLabel,
  stageMarks,
  stageSteps,
  tailFraction,
} from '../stagebar'

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

describe('secondsLabel', () => {
  it('writes German decimals, with the unit only where asked', () => {
    expect(secondsLabel(0.1, true)).toBe('0,1s')
    expect(secondsLabel(0.1, false)).toBe('0,1')
    expect(secondsLabel(2)).toBe('2s')
  })
})

describe('stageSteps', () => {
  it('carries one step per stage, on the bar scale, with the unit on the last one only', () => {
    const steps = stageSteps(DURATIONS, 15, 15)

    expect(steps.map((s) => s.label)).toEqual(['0,1', '0,5', '2', '8', '15s'])
    expect(steps[0]!.fraction).toBeCloseTo(Math.sqrt(0.1 / 15), 10)
    expect(steps[4]!.fraction).toBe(1)
    expect(steps.map((s) => s.atEnd)).toEqual([false, false, false, false, true])
  })

  it('opens exactly the stages the unlocked seconds cover, and marks the furthest one', () => {
    const steps = stageSteps(DURATIONS, 15, 2)

    expect(steps.map((s) => s.open)).toEqual([true, true, true, false, false])
    expect(steps.map((s) => s.current)).toEqual([false, false, true, false, false])
  })

  it('opens every step for the reveal, which hands in more than the ladder covers', () => {
    const steps = stageSteps(DURATIONS, 30, 30)

    expect(steps.every((s) => s.open)).toBe(true)
  })

  it('singles out no rung where the scale runs past the ladder — nothing there is „in play“', () => {
    expect(stageSteps(DURATIONS, 30, 30).some((s) => s.current)).toBe(false)
    // The board's own last stage still is: there the ladder and the scale end together.
    expect(stageSteps(DURATIONS, 15, 15)[4]!.current).toBe(true)
  })

  it('places the rungs on the ladder, which ends at its last rung even where the scale runs on', () => {
    const steps = stageSteps(DURATIONS, 30, 30)

    expect(steps[0]!.fraction).toBeCloseTo(Math.sqrt(0.1 / 15), 10)
    expect(steps[4]!.fraction).toBe(1)
    expect(steps.map((s) => s.atEnd)).toEqual([false, false, false, false, true])
  })

  it('drops the unit from the last rung where the scale runs on past it', () => {
    expect(stageSteps(DURATIONS, 30, 30)[4]!.label).toBe('15')
  })

  it('opens nothing before the first stage is reached', () => {
    const steps = stageSteps(DURATIONS, 15, 0)

    expect(steps.some((s) => s.open)).toBe(false)
    expect(steps.some((s) => s.current)).toBe(false)
  })
})

describe('scaleEndLabel', () => {
  it('labels the end of a scale the ladder falls short of', () => {
    expect(scaleEndLabel(DURATIONS, 30)).toBe('30s')
  })

  it('stays quiet where a rung already ends the bar', () => {
    expect(scaleEndLabel(DURATIONS, 15)).toBeNull()
  })
})

describe('ladderShare', () => {
  it('gives the ladder the whole bar where it is the scale', () => {
    expect(ladderShare(DURATIONS, 15)).toBe(1)
  })

  it('gives it its sqrt share of a scale that runs on to 30s', () => {
    expect(ladderShare(DURATIONS, 30)).toBeCloseTo(Math.SQRT1_2, 10)
  })

  it('leaves the whole bar to a payload without stages, rather than to a tail', () => {
    expect(ladderShare([], 15)).toBe(1)
  })
})

describe('tailFraction', () => {
  it('stays empty while the playhead is still on the ladder', () => {
    expect(tailFraction(3, DURATIONS, 30)).toBe(0)
    expect(tailFraction(15, DURATIONS, 30)).toBe(0)
  })

  it('runs the rest of the scale on the same sqrt scale, clamped at its end', () => {
    expect(tailFraction(22, DURATIONS, 30)).toBeCloseTo(
      (Math.sqrt(22 / 30) - Math.SQRT1_2) / (1 - Math.SQRT1_2),
      10,
    )
    expect(tailFraction(30, DURATIONS, 30)).toBe(1)
    expect(tailFraction(40, DURATIONS, 30)).toBe(1)
  })

  it('has nothing to fill where the ladder is the whole scale', () => {
    expect(tailFraction(15, DURATIONS, 15)).toBe(0)
  })
})
