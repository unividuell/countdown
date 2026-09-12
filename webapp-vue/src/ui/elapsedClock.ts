/** Minutes and seconds since the play's clock started — the one calculation both readouts share. */
interface Elapsed {
  minutes: number
  seconds: number
}

/**
 * The stopwatch half of the band, beside `remainingClock.ts`'s countdown, and built the same way:
 * a plain millisecond difference, deliberately not a Luxon calendar diff, because this is a
 * *duration*. Truncating rather than rounding is what makes the first second read 00:00.
 *
 * `null` for a stamp that cannot be read at all, which the band renders as no board rather than as
 * `NaN:NaN`.
 */
function elapsed(sinceIso: string | null | undefined, nowMs: number): Elapsed | null {
  if (sinceIso === null || sinceIso === undefined) return null
  const since = Date.parse(sinceIso)
  if (Number.isNaN(since)) return null
  // Clamped at zero: the skew correction can put the local clock a moment behind the server's
  // stamp, and a stopwatch opening on a negative reading is worse than one opening late.
  const total = Math.max(0, Math.trunc((nowMs - since) / 1000))
  return { minutes: Math.trunc(total / 60), seconds: total % 60 }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * What the band's board shows while a timed play is under way: `MM:SS`. No hour group — it would
 * read `00:` for all but a pathological play, and width is the scarce dimension in the band. The
 * minute group is allowed to grow instead.
 */
export function elapsedClock(sinceIso: string | null | undefined, nowMs: number): string | null {
  const run = elapsed(sinceIso, nowMs)
  if (run === null) return null
  return `${pad2(run.minutes)}:${pad2(run.seconds)}`
}

const UNIT_NAMES: [string, string][] = [
  ['Minute', 'Minuten'],
  ['Sekunde', 'Sekunden'],
]

/**
 * The same reading spoken, which is the board's only voice: a dot matrix carries no text, so the
 * `aria-label` on it is where the value is announced at all.
 */
export function elapsedReading(sinceIso: string | null | undefined, nowMs: number): string | null {
  const run = elapsed(sinceIso, nowMs)
  if (run === null) return null
  const parts = [run.minutes, run.seconds].map((value, i) => {
    const names = UNIT_NAMES[i]!
    return `${value} ${value === 1 ? names[0] : names[1]}`
  })
  return `Deine Zeit: ${parts.join(', ')}`
}
