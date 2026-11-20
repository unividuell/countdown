import { describe, expect, it } from 'vitest'
import {
  BASE_HZ,
  GROW_EASE,
  MAX_TICKS,
  MIN_TICKS,
  countTones,
  pitches,
  tickCount,
  tickTimes,
  timeAt,
} from '../countTones'

describe('tickCount', () => {
  it('counts more the further the tip is off, either way', () => {
    expect(tickCount(1, 2)).toBe(6)
    expect(tickCount(2, 1)).toBe(6)
    expect(tickCount(1, 3)).toBeGreaterThan(tickCount(1, 2))
  })

  it('stays within its bounds', () => {
    expect(tickCount(1, 1.1)).toBe(MIN_TICKS)
    expect(tickCount(0.05, 20)).toBe(MAX_TICKS)
  })

  it('a tip of the right size gets one tone', () => {
    expect(tickCount(1.6, 1.6)).toBe(1)
    expect(tickCount(1.6, 1.605)).toBe(1)
  })
})

describe('timeAt', () => {
  it('inverts the curve: linear stays, ease-out reaches half its way early', () => {
    expect(timeAt(0.5, [0, 0, 1, 1])).toBeCloseTo(0.5)
    expect(timeAt(0.5, GROW_EASE)).toBeLessThan(0.25)
    expect(timeAt(1, GROW_EASE)).toBeCloseTo(1)
  })
})

describe('tickTimes', () => {
  it('ticks ever slower, as B decelerates, the last one when B arrives', () => {
    const times = tickTimes(12, 0.7, GROW_EASE)
    const gaps = times.map((t, i) => t - (times[i - 1] ?? 0))

    expect(times).toHaveLength(12)
    expect(times.at(-1)).toBe(0.7)
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]!)
  })

  it('one tick lands at the end', () => {
    expect(tickTimes(1, 0.7, GROW_EASE)).toEqual([0.7])
  })
})

describe('pitches', () => {
  it('climbs the major pentatonic from G4, or comes down it to G4', () => {
    const up = pitches(6, true)

    // G A B D E G
    expect(up.map((hz) => Math.round(12 * Math.log2(hz / BASE_HZ)))).toEqual([0, 2, 4, 7, 9, 12])
    expect(pitches(6, false)).toEqual([...up].reverse())
  })
})

describe('countTones', () => {
  it('rises when B grows, falls when it shrinks', () => {
    const grow = countTones(1, 2, 0.7).map((tone) => tone.hz)
    const shrink = countTones(2, 1, 0.7).map((tone) => tone.hz)

    for (let i = 1; i < grow.length; i++) expect(grow[i]).toBeGreaterThan(grow[i - 1]!)
    for (let i = 1; i < shrink.length; i++) expect(shrink[i]).toBeLessThan(shrink[i - 1]!)
  })

  it('a tip of the right size is one tone, when B arrives', () => {
    expect(countTones(1.6, 1.6, 0.7)).toEqual([{ atS: 0.7, hz: BASE_HZ }])
  })
})
