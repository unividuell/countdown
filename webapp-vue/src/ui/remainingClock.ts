/** Hours, minutes and seconds left of a round — the one calculation both readouts below share. */
interface Remaining {
  hours: number
  minutes: number
  seconds: number
  total: number
}

/**
 * A plain millisecond difference, deliberately not a Luxon calendar diff: this is a *duration*, so
 * no zone and no DST rule enters it — a 25-hour round simply reads 25 hours. Truncating rather than
 * rounding is what makes a descending timer tick 03 -> 02 -> 01 -> 00, the same choice
 * `communities/countdown.ts` documents for the header board.
 *
 * `null` for an end that cannot be read at all, which the band renders as no board rather than as
 * `NaN:NaN:NaN`.
 */
function remaining(endIso: string | null | undefined, nowMs: number): Remaining | null {
  if (endIso === null || endIso === undefined) return null
  const end = Date.parse(endIso)
  if (Number.isNaN(end)) return null
  // Clamped at zero: nothing refetches the round at its boundary, so the band has to come to rest
  // on a reading that is still true rather than count on past it.
  const total = Math.max(0, Math.trunc((end - nowMs) / 1000))
  return {
    // The hour group is allowed past 24 — a DST round is genuinely 25 hours long, and wrapping it
    // would claim the round is nearly over when a whole day is left.
    hours: Math.trunc(total / 3600),
    minutes: Math.trunc((total % 3600) / 60),
    seconds: total % 60,
    total,
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** What the game header's flip-dot board shows: `HH:MM:SS`, every group two digits wide. */
export function remainingClock(endIso: string | null | undefined, nowMs: number): string | null {
  const left = remaining(endIso, nowMs)
  if (left === null) return null
  return `${pad2(left.hours)}:${pad2(left.minutes)}:${pad2(left.seconds)}`
}

const UNIT_NAMES: [string, string][] = [
  ['Stunde', 'Stunden'],
  ['Minute', 'Minuten'],
  ['Sekunde', 'Sekunden'],
]

/**
 * The same reading spoken, which is the board's only voice: a dot matrix carries no text, so the
 * `aria-label` on it is where the value is announced at all.
 */
export function remainingReading(endIso: string | null | undefined, nowMs: number): string | null {
  const left = remaining(endIso, nowMs)
  if (left === null) return null
  if (left.total === 0) return 'Diese Runde ist beendet'
  const parts = [left.hours, left.minutes, left.seconds].map((value, i) => {
    const names = UNIT_NAMES[i]!
    return `${value} ${value === 1 ? names[0] : names[1]}`
  })
  return `Noch ${parts.join(', ')} in dieser Runde`
}
