import { readFileSync } from 'node:fs'
import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { editionCells, frozenSince, roundAt, roundStart } from '../editionGrid'

// The same file the JVM suite asserts against (EditionGridGoldenVectorTest).
const VECTORS_PATH = '../shared/edition-grid/vectors.json'

interface Vectors {
  version: number
  roundStart: { startsAt: string; zone: string; round: number; roundStart: string }[]
  roundAt: { now: string; startsAt: string; zone: string; round: number }[]
}

const vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as Vectors

describe('golden vectors', () => {
  it('are version 1', () => {
    expect(vectors.version).toBe(1)
  })

  it.each(vectors.roundStart)('roundStart $startsAt $zone round $round', (c) => {
    expect(roundStart(c.startsAt, c.zone, c.round).toMillis()).toBe(
      DateTime.fromISO(c.roundStart).toMillis(),
    )
  })

  it.each(vectors.roundAt)('roundAt $now in $startsAt $zone', (c) => {
    expect(roundAt(DateTime.fromISO(c.now), c.startsAt, c.zone)).toBe(c.round)
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
    startsAt: '2026-12-20T17:00:00Z',
    zone: 'Europe/Berlin',
    gamesFromRound: -30,
    gamesUntilRound: 0,
    phaseTwoStartRound: -7,
  }
  const now = DateTime.fromISO('2026-11-05T11:00:00Z')
  const cells = editionCells(edition, now)
  const byRound = (n: number) => cells.find((c) => c.round === n)!

  it('runs from the current round to the start', () => {
    expect(cells[0]!.round).toBe(-45)
    expect(cells[0]!.today).toBe(true)
    expect(cells[0]!.start.toISO()).toBe('2026-11-04T18:00:00.000+01:00')
    expect(cells.at(-1)!.round).toBe(1)
    expect(cells.at(-1)!.kind).toBe('start')
    expect(cells).toHaveLength(47)
  })

  it('marks only the current round as today', () => {
    expect(cells.filter((c) => c.today)).toHaveLength(1)
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

  it('starts at the first game round when that lies before today', () => {
    const late = editionCells(edition, DateTime.fromISO('2026-12-01T10:00:00Z'))

    expect(late[0]!.round).toBe(-30)
    expect(late[0]!.today).toBe(false)
  })
})
