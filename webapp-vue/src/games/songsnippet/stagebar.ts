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
  /** Position of the boundary on the ladder, 0..1, on the same scale the fill uses. */
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
   * The last rung, at the ladder's round right end. It needs no gap (the ladder simply stops) and
   * its label hangs off that end instead of being centred under one — on the reveal too, where the
   * extra 15s follow behind it.
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
  const endsScale = longest >= totalSeconds
  return durations.map((d, index) => {
    const fraction = barFraction(d, longest)
    const atEnd = fraction >= 1
    return {
      label: secondsLabel(d, atEnd && endsScale),
      fraction,
      open: index < openCount,
      current: !playsWholeScale && index === openCount - 1,
      atEnd,
    }
  })
}

/**
 * How much of the bar the ladder takes: all of it on the board, √½ on the reveal's 30s scale. On a
 * sqrt scale that share is all the shrinking there is — the ladder inside is the board's own,
 * rungs and fill at the same fractions, so the reveal can draw it smaller without re-placing them.
 */
export function ladderShare(durations: number[], totalSeconds: number): number {
  const longest = durations[durations.length - 1] ?? 0
  // No stages, no ladder to shrink: the bar stays whole instead of turning into one long tail.
  return longest > 0 ? barFraction(longest, totalSeconds) : 1
}

/**
 * How far [positionSeconds] has run into the tail — the scale beyond the ladder, the reveal's extra
 * 15s — as 0..1 of it, on the same sqrt scale as the rest of the bar. `0` where there is no tail.
 */
export function tailFraction(
  positionSeconds: number,
  durations: number[],
  totalSeconds: number,
): number {
  const share = ladderShare(durations, totalSeconds)
  if (share >= 1) return 0
  return Math.max(barFraction(positionSeconds, totalSeconds) - share, 0) / (1 - share)
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
