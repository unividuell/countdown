/**
 * The bar's time scale is sqrt, not linear: linearly, the 0.1s stage would be a 0.7% sliver.
 * sqrt keeps the short stages visible (0.1s ≈ 8% of the bar) while staying monotone and exact at
 * every boundary. Display-only — nothing here has a Kotlin twin, so no golden vectors needed.
 */
export function barFraction(seconds: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0
  const clamped = Math.min(Math.max(seconds, 0), totalSeconds)
  return Math.sqrt(clamped / totalSeconds)
}

/** One mark per stage boundary, as fractions of the bar width. */
export function stageMarks(durations: number[], totalSeconds: number): number[] {
  return durations.map((d) => barFraction(d, totalSeconds))
}

/** One rung of the ladder: where its boundary sits, what it says, and how far the player got. */
export interface StageStep {
  /** German label: comma as the decimal separator, the unit only where it is not repeated. */
  label: string
  /** Position of the boundary on the bar, 0..1, on the same scale the fill uses. */
  fraction: number
  /** Already audible. A closed step's label renders dimmed. */
  open: boolean
  /** The furthest step the player has opened — the one the play button is about to sound. */
  current: boolean
  /** Ends the bar: no gap is drawn there, and its label hangs off the right edge instead. */
  last: boolean
}

/**
 * The ladder as the bar shows it — a step per stage, with the boundary positions the gaps and the
 * labels below them share. Pure, because it is the half of the bar a test can assert on: happy-dom
 * computes no layout, so the numbers have to be checkable without one.
 *
 * [unlockedSeconds] decides openness by duration rather than by index, which is what lets the
 * reveal hand in the full 30s and get every step open without knowing anything about stages.
 */
export function stageSteps(
  durations: number[],
  totalSeconds: number,
  unlockedSeconds: number,
): StageStep[] {
  const openCount = durations.filter((d) => d <= unlockedSeconds).length
  return durations.map((d, index) => ({
    label: secondsLabel(d, index === durations.length - 1),
    fraction: barFraction(d, totalSeconds),
    open: index < openCount,
    current: index === openCount - 1,
    last: index === durations.length - 1,
  }))
}

/** `0.1` → „0,1“; on the bar the unit rides on the last rung only, where it labels the whole scale. */
export function secondsLabel(seconds: number, withUnit = true): string {
  return `${String(seconds).replace('.', ',')}${withUnit ? 's' : ''}`
}
