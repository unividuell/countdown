import { readFileSync } from 'node:fs'
import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { calendarSpan, editionCells, frozenSince, roundAt, roundStart } from '../editionGrid'

// The same file the JVM suite asserts against (EditionGridGoldenVectorTest).
const VECTORS_PATH = '../shared/edition-grid/vectors.json'

interface Vectors {
  version: number
  roundStart: { targetAt: string; zone: string; round: number; roundStart: string }[]
  roundAt: { now: string; targetAt: string; zone: string; round: number }[]
}

const vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as Vectors

describe('golden vectors', () => {
  it('are version 1', () => {
    expect(vectors.version).toBe(1)
  })

  it.each(vectors.roundStart)('roundStart $targetAt $zone round $round', (c) => {
    expect(roundStart(c.targetAt, c.zone, c.round).toMillis()).toBe(
      DateTime.fromISO(c.roundStart).toMillis(),
    )
  })

  it.each(vectors.roundAt)('roundAt $now in $targetAt $zone', (c) => {
    expect(roundAt(DateTime.fromISO(c.now), c.targetAt, c.zone)).toBe(c.round)
  })
})

describe('frozenSince', () => {
  it('is the start of the round before the first game round', () => {
    const start = '2026-12-20T17:00:00Z'

    expect(frozenSince(start, 'Europe/Berlin', -30).toMillis()).toBe(
      roundStart(start, 'Europe/Berlin', -31).toMillis(),
    )
  })
})

describe('editionCells', () => {
  const edition = {
    targetAt: '2026-12-20T17:00:00Z',
    zone: 'Europe/Berlin',
    gamesFromRound: -30,
    gamesUntilRound: 0,
    phaseTwoStartRound: -7,
  }
  const now = DateTime.fromISO('2026-11-05T11:00:00Z')
  const cells = editionCells(edition, now)
  const byRound = (n: number) => cells.find((c) => c.round === n)!

  it('runs from three days before the first game round to the start', () => {
    expect(cells[0]!.round).toBe(-33)
    expect(cells[0]!.start.toISO()).toBe('2026-11-16T18:00:00.000+01:00')
    expect(cells.at(-1)!.round).toBe(1)
    expect(cells.at(-1)!.kind).toBe('target')
    expect(cells).toHaveLength(35)
    expect(calendarSpan(edition)).toBe(35)
  })

  it('leaves today out while it lies before the range', () => {
    expect(cells.some((c) => c.today)).toBe(false)
  })

  // 2026-12-01 11:00 Berlin lies in round -19 (30 Nov 18:00 to 1 Dec 18:00).
  it('keeps the range during the run and marks only the current round as today', () => {
    const running = editionCells(edition, DateTime.fromISO('2026-12-01T10:00:00Z'))

    expect(running[0]!.round).toBe(-33)
    expect(running.filter((c) => c.today).map((c) => c.round)).toEqual([-19])
  })

  it('freezes at the round before the first game round', () => {
    expect(cells.filter((c) => c.freezesHere).map((c) => c.round)).toEqual([-31])
    expect(byRound(-31).kind).toBe('none')
  })

  it('splits the game rounds into the two phases', () => {
    for (let m = -30; m <= -8; m++) expect(byRound(m).kind).toBe('phase-one')
    for (let m = -7; m <= 0; m++) expect(byRound(m).kind).toBe('phase-two')
  })

  it('has no phase two when none is set', () => {
    const none = editionCells({ ...edition, phaseTwoStartRound: null }, now)

    expect(none.find((c) => c.round === 0)!.kind).toBe('phase-one')
  })
})
