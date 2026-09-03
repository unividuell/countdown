import { describe, expect, it } from 'vitest'
import { remainingClock, remainingReading } from '@/ui/remainingClock'

const at = (iso: string) => Date.parse(iso)

describe('remainingClock', () => {
  it('reads the gap to the round end as hours, minutes and seconds', () => {
    expect(remainingClock('2026-06-15T09:00:00Z', at('2026-06-15T06:45:27Z'))).toBe('02:14:33')
  })

  it('pads every group to two digits, so the width never changes mid-round', () => {
    expect(remainingClock('2026-06-15T09:00:00Z', at('2026-06-15T08:59:05Z'))).toBe('00:00:55')
  })

  // A DST round is 25 hours long, so the hour group has to be allowed past 24 rather than wrap.
  it('lets the hour group run past 24 rather than wrapping it into a day', () => {
    expect(remainingClock('2026-06-15T09:00:00Z', at('2026-06-14T08:00:00Z'))).toBe('25:00:00')
  })

  // The card does not refetch at the boundary, so the band has to come to rest somewhere honest
  // rather than count upwards into a negative reading.
  it('rests at zero once the round has ended', () => {
    expect(remainingClock('2026-06-15T09:00:00Z', at('2026-06-15T09:00:01Z'))).toBe('00:00:00')
  })

  it('truncates, so a descending timer ticks 03 -> 02 -> 01 -> 00', () => {
    expect(remainingClock('2026-06-15T09:00:00Z', at('2026-06-15T08:59:57Z'))).toBe('00:00:03')
  })

  it('answers null for an end it cannot read, so the band shows no board at all', () => {
    expect(remainingClock('tomorrow-ish', at('2026-06-15T09:00:00Z'))).toBeNull()
    expect(remainingClock(null, at('2026-06-15T09:00:00Z'))).toBeNull()
  })
})

describe('remainingReading', () => {
  it('spells the readout out, because a dot matrix reads as nothing', () => {
    expect(remainingReading('2026-06-15T09:00:00Z', at('2026-06-15T06:45:27Z'))).toBe(
      'Noch 2 Stunden, 14 Minuten, 33 Sekunden in dieser Runde',
    )
  })

  it('uses the singular where a group is exactly one', () => {
    expect(remainingReading('2026-06-15T09:00:00Z', at('2026-06-15T07:58:59Z'))).toBe(
      'Noch 1 Stunde, 1 Minute, 1 Sekunde in dieser Runde',
    )
  })

  // „Noch 0 Stunden, 0 Minuten, 0 Sekunden" is what the clamp renders, and reading it out loud is
  // worse than saying the one thing it actually means.
  it('says the round is over rather than reading three zeroes', () => {
    expect(remainingReading('2026-06-15T09:00:00Z', at('2026-06-15T09:00:01Z'))).toBe(
      'Diese Runde ist beendet',
    )
  })

  it('answers null for an end it cannot read, in step with the clock', () => {
    expect(remainingReading(null, at('2026-06-15T09:00:00Z'))).toBeNull()
  })
})
