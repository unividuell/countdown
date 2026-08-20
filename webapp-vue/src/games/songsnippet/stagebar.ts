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
