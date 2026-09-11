import { describe, expect, it } from 'vitest'
import { elapsedClock, elapsedReading } from '@/ui/elapsedClock'

const at = (iso: string) => Date.parse(iso)
const REVEALED = '2026-06-15T08:00:00Z'

describe('elapsedClock', () => {
  it('reads the time since the reveal as minutes and seconds', () => {
    expect(elapsedClock(REVEALED, at('2026-06-15T08:01:05Z'))).toBe('01:05')
  })

  it('pads both groups, so the width never changes mid-play', () => {
    expect(elapsedClock(REVEALED, at('2026-06-15T08:00:07Z'))).toBe('00:07')
  })

  it('truncates, so the first second reads 00:00 rather than 00:01', () => {
    expect(elapsedClock(REVEALED, at('2026-06-15T08:00:00.900Z'))).toBe('00:00')
  })

  // The skew correction can put the local clock a moment behind the server's stamp, and `-00:01`
  // would be the first thing the player ever reads off the new face.
  it('rests at zero for a clock that is behind the stamp', () => {
    expect(elapsedClock(REVEALED, at('2026-06-15T07:59:58Z'))).toBe('00:00')
  })

  // No hour group: it would read `00:` for all but a pathological play, and width is the scarce
  // dimension in the band. Past 99 minutes the group simply grows.
  it('lets the minute group grow rather than carrying into hours', () => {
    expect(elapsedClock(REVEALED, at('2026-06-15T09:45:03Z'))).toBe('105:03')
  })

  it('answers null for a stamp it cannot read, so the band shows no board at all', () => {
    expect(elapsedClock('just now', at('2026-06-15T08:00:00Z'))).toBeNull()
    expect(elapsedClock(null, at('2026-06-15T08:00:00Z'))).toBeNull()
  })
})

describe('elapsedReading', () => {
  it('spells the stopwatch out, because the dots themselves say nothing', () => {
    expect(elapsedReading(REVEALED, at('2026-06-15T08:02:05Z'))).toBe(
      'Deine Zeit: 2 Minuten, 5 Sekunden',
    )
  })

  it('uses the singular where the number calls for it', () => {
    expect(elapsedReading(REVEALED, at('2026-06-15T08:01:01Z'))).toBe(
      'Deine Zeit: 1 Minute, 1 Sekunde',
    )
  })

  it('answers null for a stamp it cannot read', () => {
    expect(elapsedReading(null, at('2026-06-15T08:00:00Z'))).toBeNull()
  })
})
