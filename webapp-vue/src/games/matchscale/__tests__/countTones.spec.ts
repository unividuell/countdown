import { describe, expect, it } from 'vitest'
import {
  BASE_HZ,
  BRAKE,
  MAX_TICKS,
  SINGLE_TICK_GROW_MS,
  STEP,
  TICK_S,
  countTones,
  growEasing,
  growMs,
  pitches,
  tickCount,
  tickTimes,
} from '../countTones'

describe('tickCount', () => {
  it('counts one tick per step of size, either way', () => {
    expect(tickCount(1, STEP ** 10)).toBe(10)
    expect(tickCount(STEP ** 10, 1)).toBe(10)
    expect(tickCount(1, 3)).toBeGreaterThan(tickCount(1, 2))
  })

  it('stays within 1..MAX_TICKS', () => {
    expect(tickCount(1.6, 1.6)).toBe(1)
    expect(tickCount(1.6, 1.605)).toBe(1)
    expect(tickCount(0.05, 20)).toBe(MAX_TICKS)
  })
})

describe('tickTimes', () => {
  it('starts at 0, ticks evenly, then brakes', () => {
    const times = tickTimes(MAX_TICKS)
    const gaps = times.slice(1).map((t, i) => t - times[i]!)

    expect(times[0]).toBe(0)
    expect(gaps[0]).toBeCloseTo(TICK_S)
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]!)
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1]!)
    expect(gaps.at(-1)!).toBeLessThan(TICK_S * (1 + BRAKE))
  })

  it('a single tick sounds at 0', () => {
    expect(tickTimes(1)).toEqual([0])
  })
})

describe('pitches', () => {
  it(`climbs from ${BASE_HZ} Hz one step per tick, or comes down to it`, () => {
    const up = pitches(4, true)

    expect(up[0]).toBe(BASE_HZ)
    for (let i = 1; i < up.length; i++) expect(up[i]! / up[i - 1]!).toBeCloseTo(STEP)
    expect(pitches(4, false)).toEqual([...up].reverse())
  })
})

describe('countTones', () => {
  it('rises when B grows, falls when it shrinks', () => {
    const grow = countTones(1, 2).map((tone) => tone.hz)
    const shrink = countTones(2, 1).map((tone) => tone.hz)

    for (let i = 1; i < grow.length; i++) expect(grow[i]).toBeGreaterThan(grow[i - 1]!)
    for (let i = 1; i < shrink.length; i++) expect(shrink[i]).toBeLessThan(shrink[i - 1]!)
  })

  it('the pitch moves as far as B: ×2 is about an octave', () => {
    const hz = countTones(1, 2).map((tone) => tone.hz)
    // n tones span n − 1 steps; one step more is the size ratio, within half a step of rounding.
    const span = Math.log((hz.at(-1)! / hz[0]!) * STEP)

    expect(Math.abs(span - Math.log(2))).toBeLessThanOrEqual(Math.log(STEP) / 2)
  })

  it('a tip of the right size is one tone, at once', () => {
    expect(countTones(1.6, 1.6)).toEqual([{ atS: 0, hz: BASE_HZ }])
  })
})

describe('growth', () => {
  it('lasts until the last tick', () => {
    const tones = countTones(1, 2)

    expect(growMs(tones)).toBeCloseTo(tones.at(-1)!.atS * 1000)
  })

  it('reaches tick i at i / (n − 1) of the way', () => {
    const tones = [
      { atS: 0, hz: 1 },
      { atS: 0.05, hz: 1 },
      { atS: 0.2, hz: 1 },
    ]

    expect(growEasing(tones)).toBe('linear(0 0%, 0.5 25%, 1 100%)')
  })

  it('a single tick gets a short fixed ease', () => {
    const tones = countTones(1.6, 1.6)

    expect(growMs(tones)).toBe(SINGLE_TICK_GROW_MS)
    expect(growEasing(tones)).toBe('ease-out')
  })
})
