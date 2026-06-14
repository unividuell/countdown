import { describe, expect, it } from 'vitest'
import { computeView, nextBaseUnitConfig, boundaryAction } from '@/communities/countdown'
import type { Round } from '@/api/types'

const zone = 'Europe/Berlin'
const ms = (iso: string) => Date.parse(iso)
const daysBase = { months: false, weeks: false, days: true }

const round10: Round = {
  number: 10,
  label: 'T-10',
  start: '2026-06-14T09:00:00Z',
  end: '2026-06-15T09:00:00Z',
}
const startsAt = '2026-06-25T09:00:00Z'

describe('computeView', () => {
  it('is idle without a round or startsAt', () => {
    expect(computeView(null, startsAt, zone, ms('2026-06-14T09:00:00Z'), daysBase).state).toBe(
      'idle',
    )
    expect(computeView(round10, null, zone, ms('2026-06-14T09:00:00Z'), daysBase).state).toBe(
      'idle',
    )
  })

  it('counts down before start: day count = |round.number|, h:m:s to next boundary', () => {
    // 12h before round end (2026-06-14T21:00:00Z)
    const v = computeView(round10, startsAt, zone, ms('2026-06-14T21:00:00Z'), daysBase)
    expect(v.state).toBe('before')
    expect(v.prefix).toBe('T-')
    expect(v.label).toBe('T-10')
    expect(v.chips).toEqual([
      { value: '10', unit: 'd' },
      { value: '12', unit: 'h' },
      { value: '00', unit: 'm' },
      { value: '00', unit: 's' },
    ])
  })

  it('weeks base re-expresses the time to start with a w chip', () => {
    const v = computeView(round10, startsAt, zone, ms('2026-06-14T21:00:00Z'), {
      months: false,
      weeks: true,
      days: true,
    })
    expect(v.chips.some((c) => c.unit === 'w')).toBe(true)
    expect(v.chips.some((c) => c.unit === 'd')).toBe(true)
  })

  it('re-expresses the calendar diff in the given zone (DST guard, not UTC)', () => {
    // Spring-forward 2026-03-29: Berlin clocks jump 02:00 -> 03:00. With start/now built {zone},
    // the weeks+days calendar diff is done against Berlin wall time, so the d chip is 1; running
    // the same diff in UTC truncates to 0. This would fail if {zone} were dropped from fromMillis/fromISO.
    const weeksBase = { months: false, weeks: true, days: true }
    const r: Round = {
      number: 1,
      label: 'T-1',
      start: '2026-03-28T22:00:00Z',
      end: '2026-03-29T09:00:00Z',
    }
    const v = computeView(r, '2026-03-29T21:00:00Z', zone, ms('2026-03-28T22:00:00Z'), weeksBase)
    expect(v.state).toBe('before')
    expect(v.chips).toEqual([
      { value: '0', unit: 'w' },
      { value: '1', unit: 'd' }, // Berlin -> 1; UTC calendar diff would truncate to 0
      { value: '11', unit: 'h' },
      { value: '00', unit: 'm' },
      { value: '00', unit: 's' },
    ])
  })

  it('counts up after start (event running)', () => {
    const r: Round = {
      number: -1,
      label: 'T+1',
      start: '2026-06-25T09:00:00Z',
      end: '2026-06-26T09:00:00Z',
    }
    const v = computeView(r, startsAt, zone, ms('2026-06-25T11:30:00Z'), daysBase)
    expect(v.state).toBe('after')
    expect(v.prefix).toBe('T+')
    expect(v.label).toBe('T+1')
    expect(v.chips[0]).toEqual({ value: '0', unit: 'd' }) // 2h30m after start
    expect(v.chips[1]).toEqual({ value: '02', unit: 'h' })
  })
})

describe('nextBaseUnitConfig cycles days -> months+weeks -> weeks -> days', () => {
  it('cycles', () => {
    const a = nextBaseUnitConfig({ months: false, weeks: false, days: true })
    expect(a).toEqual({ months: true, weeks: true, days: true })
    const b = nextBaseUnitConfig(a)
    expect(b).toEqual({ months: false, weeks: true, days: true })
    const c = nextBaseUnitConfig(b)
    expect(c).toEqual({ months: false, weeks: false, days: true })
  })
})

describe('boundaryAction', () => {
  const next: Round = {
    number: 9,
    label: 'T-9',
    start: '2026-06-15T09:00:00Z',
    end: '2026-06-16T09:00:00Z',
  }
  it('none before the boundary', () =>
    expect(boundaryAction(round10, next, ms('2026-06-15T08:59:59Z'))).toBe('none'))
  it('shift into nextRound when past the boundary but inside next', () =>
    expect(boundaryAction(round10, next, ms('2026-06-15T12:00:00Z'))).toBe('shift'))
  it('refetch when past nextRound too (or no next)', () => {
    expect(boundaryAction(round10, next, ms('2026-06-16T12:00:00Z'))).toBe('refetch')
    expect(boundaryAction(round10, null, ms('2026-06-15T12:00:00Z'))).toBe('refetch')
  })
})
