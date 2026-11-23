/*
 * Streak badge on a roster avatar: which band, how big, where.
 *
 *   streak   band                 label
 *   < 3      none                 -
 *   3-9      flame-orange         Flamme
 *   10-19    flame-blue           blaue Flamme
 *   20-32    diamond-ice          Eis-Diamant
 *   33-49    diamond-ruby         Rubin
 *   50+      diamond-ruby-glint   funkelnder Rubin
 *
 * Size, one log curve across all bands (px):  14 + 12 * ln(min(n, 50) - 2) / ln(48)
 *   n:   3    10    20    33    50+
 *   px: 14  20.5  23.0  24.6   26
 */

/** The flare's length; the row stops clipping for as long. */
export const FLARE_MS = 600

export type StreakBand =
  'flame-orange' | 'flame-blue' | 'diamond-ice' | 'diamond-ruby' | 'diamond-ruby-glint'

/** First streak length of each band, highest first so the first match wins. */
const BANDS: readonly [number, StreakBand][] = [
  [50, 'diamond-ruby-glint'],
  [33, 'diamond-ruby'],
  [20, 'diamond-ice'],
  [10, 'flame-blue'],
  [3, 'flame-orange'],
]

const LABELS: Record<StreakBand, string> = {
  'flame-orange': 'Flamme',
  'flame-blue': 'blaue Flamme',
  'diamond-ice': 'Eis-Diamant',
  'diamond-ruby': 'Rubin',
  'diamond-ruby-glint': 'funkelnder Rubin',
}

/** The band a streak falls into, or null below 3 (no badge). */
export function bandOf(streak: number): StreakBand | null {
  return BANDS.find(([from]) => streak >= from)?.[1] ?? null
}

/** Edge length in px of the square badge; capped at 50. Only meaningful from 3. */
export function markSize(streak: number): number {
  return 14 + (12 * Math.log(Math.min(streak, 50) - 2)) / Math.log(48)
}

/**
 * Badge top-left in px from the avatar's top-left. The badge foot (bottom centre, y = 0.9 s) sits
 * at 45° top-right, 3px inside the 48px circle, so the badge grows up and out of the circle.
 */
export function markBox(size: number): { left: number; top: number } {
  return { left: 38.8 - size * 0.5, top: 9.2 - size * 0.9 }
}

export function bandLabel(band: StreakBand): string {
  return LABELS[band]
}
