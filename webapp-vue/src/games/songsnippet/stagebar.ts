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
  /** German label: comma as the decimal separator, the unit only on whoever ends the scale. */
  label: string
  /** Position of the boundary on the bar, 0..1, on the same scale the fill uses. */
  fraction: number
  /** Already audible. A closed step's label renders dimmed. */
  open: boolean
  /**
   * The rung the play button is about to sound — the furthest one opened. Nothing is current where
   * the scale runs past the whole ladder: the reveal plays 30s of hook, not a stage, so singling
   * one out there would mark a rung that means nothing.
   */
  current: boolean
  /**
   * Sits exactly at the bar's right edge, which happens only when this rung's duration IS the
   * scale. Then it needs no gap (the bar simply stops) and its label hangs off that edge instead
   * of being centred under one. On the reveal's 30s scale no rung reaches the end — the 15s one
   * lands at 71%, and a label pinned right there would float mid-bar with the rest running past.
   */
  atEnd: boolean
}

/**
 * The ladder as the bar shows it — a rung per stage, with the boundary positions that the gaps and
 * the labels below them share. Pure, because it is the half of the bar a test can assert on:
 * happy-dom computes no layout, so the numbers have to be checkable without one.
 *
 * [unlockedSeconds] decides openness by duration rather than by index, which is what lets the
 * reveal hand in the full 30s and get every rung open without knowing anything about stages.
 */
export function stageSteps(
  durations: number[],
  totalSeconds: number,
  unlockedSeconds: number,
): StageStep[] {
  const openCount = durations.filter((d) => d <= unlockedSeconds).length
  const longest = durations[durations.length - 1] ?? 0
  const playsWholeScale = unlockedSeconds > longest
  return durations.map((d, index) => {
    const fraction = barFraction(d, totalSeconds)
    const atEnd = fraction >= 1
    return {
      label: secondsLabel(d, atEnd),
      fraction,
      open: index < openCount,
      current: !playsWholeScale && index === openCount - 1,
      atEnd,
    }
  })
}

/**
 * The scale's own right edge, for a bar the ladder does not reach: the reveal plays 30s while the
 * rungs stop at 15s, and an unlabelled end reads as if the ladder simply ran out there. `null`
 * where a rung already ends the bar — the board's 15s scale needs no second label for the same
 * spot.
 */
export function scaleEndLabel(durations: number[], totalSeconds: number): string | null {
  const longest = durations[durations.length - 1] ?? 0
  return longest >= totalSeconds ? null : secondsLabel(totalSeconds)
}

/** `0.1` → „0,1“; the unit rides on whoever labels the end of the scale. */
export function secondsLabel(seconds: number, withUnit = true): string {
  return `${String(seconds).replace('.', ',')}${withUnit ? 's' : ''}`
}
