/**
 * Round arithmetic for the edition form's calendar. Kotlin counterpart: `CountdownEngine`
 * (`intervalOf`, `roundAt`); pinned by `shared/edition-grid/vectors.json`.
 *
 *   round m = [startsAt + (m-1) days, startsAt + m days)   in the edition's zone
 *
 * 0 is the last day before the start, 1 the first event day, earlier rounds are negative. Days are
 * calendar days, so a DST day is still one round.
 *
 * The form shows unsaved values, so the server cannot be asked; this mirrors it for display only.
 */
import { DateTime } from 'luxon'

export type CellKind = 'none' | 'phase-one' | 'phase-two' | 'start'

export interface GridCell {
  round: number
  start: DateTime
  kind: CellKind
  today: boolean
  freezesHere: boolean
}

export interface EditionShape {
  startsAt: string
  zone: string
  gamesFromRound: number
  gamesUntilRound: number
  phaseTwoStartRound: number | null
}

/** The instant round [round] begins: [startsAt] in [zone] plus `round - 1` calendar days. */
export function roundStart(startsAt: string, zone: string, round: number): DateTime {
  return DateTime.fromISO(startsAt, { zone }).plus({ days: round - 1 })
}

/** The round containing [now] (start-inclusive). */
export function roundAt(now: DateTime, startsAt: string, zone: string): number {
  const first = DateTime.fromISO(startsAt, { zone })
  const at = now.setZone(zone)

  // Day estimate by calendar date, then corrected: the start's time of day decides the last step.
  let k = Math.round(at.startOf('day').diff(first.startOf('day'), 'days').days)
  while (first.plus({ days: k }) > at) k--
  while (first.plus({ days: k + 1 }) <= at) k++

  return k + 1
}

/** From this moment on the edition's settings are frozen: the start of the round before the games. */
export function frozenSince(startsAt: string, zone: string, gamesFromRound: number): DateTime {
  return roundStart(startsAt, zone, gamesFromRound - 1)
}

/** The calendar draws one cell per round; beyond ~100 years it would hang the tab. */
export const MAX_CALENDAR_ROUNDS = 36500

/** Days shown before the first game round, e.g. games from -30 → the calendar opens at -33. */
const LEAD_ROUNDS = 3

/** How many cells [editionCells] would draw. */
export function calendarSpan(e: EditionShape): number {
  return 2 - (e.gamesFromRound - LEAD_ROUNDS)
}

/**
 * One cell per round, from [LEAD_ROUNDS] before the first game round up to the start — the same
 * range before and during the run. Today is marked only when it falls inside.
 */
export function editionCells(e: EditionShape, now: DateTime): GridCell[] {
  const current = roundAt(now, e.startsAt, e.zone)
  const first = e.gamesFromRound - LEAD_ROUNDS

  const kindOf = (m: number): CellKind => {
    if (m === 1) return 'start'
    if (m < e.gamesFromRound || m > e.gamesUntilRound) return 'none'
    if (e.phaseTwoStartRound !== null && m >= e.phaseTwoStartRound) return 'phase-two'
    return 'phase-one'
  }

  const cells: GridCell[] = []
  for (let m = first; m <= 1; m++) {
    cells.push({
      round: m,
      start: roundStart(e.startsAt, e.zone, m),
      kind: kindOf(m),
      today: m === current,
      freezesHere: m === e.gamesFromRound - 1,
    })
  }

  return cells
}
