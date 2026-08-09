/**
 * The timings and proportions of the wheel, in one place so they can be tuned in the lab without
 * hunting through components.
 */
import type { CSSProperties } from 'vue'

/** One full turn of the knob while the ring paints itself behind it. */
export const BOOT_SWEEP_MS = 800

/**
 * How far the painted ring trails the knob. This gap is the whole effect: it turns the knob into a
 * comet head and the ring into its trail. Too small and they move as one block.
 */
export const BOOT_TRAIL_MS = 70

// The wheel is a thin rainbow band, not a filled disc — the original it is ported from is a ring
// with an empty centre, and only the ring is grabbable. Both fractions below are of the wheel's
// radius.

/** The rainbow band's inner edge. Inside it the wheel is empty and not grabbable. */
export const BAND_INNER_FRACTION = 0.78

/** Where the knob rides — the middle of the band. */
export const KNOB_TRACK_FRACTION = 0.89

/**
 * Once a drag has started it follows the pointer anywhere — on the band, off it, even past the
 * wheel's own element — because a knob you have already grabbed must keep following your hand.
 * The one exception is this: within this fraction of the centre, `atan2` is numerically unstable,
 * so a millimetre of pointer movement there would read as a ninety-degree jump. This is not a dead
 * zone (it never stops a drag from starting or running) — it is a stability guard that holds the
 * angle's last value for the moves that fall inside it.
 */
export const CENTRE_HOLD_FRACTION = 0.08

/**
 * The knob's own size, as a fraction of the wheel. Shared with the reveal wheel's markers, so
 * "my guess covers the knob exactly" is built rather than recomputed.
 */
export const KNOB_SIZE_FRACTION = 0.09

/**
 * Where a knob-sized box sits on the wheel: `top` puts its *centre* on [trackFraction] — the raw
 * CSS property addresses the box's upper edge, hence subtracting half the box's own size. Width
 * and height come along so the marker and the knob cannot drift apart in size either.
 *
 * Rounded because the arithmetic is percentages of percentages: 50 × (1 − 0.89) − 4.5 answers
 * 1.0000000000000036 in IEEE754.
 */
export function trackBoxStyle(trackFraction: number): CSSProperties {
  const size = `${KNOB_SIZE_FRACTION * 100}%`
  const top = 50 * (1 - trackFraction) - (KNOB_SIZE_FRACTION * 100) / 2
  return { top: `${Math.round(top * 10000) / 10000}%`, width: size, height: size }
}

/** Cubic, written as multiplication — `**` is fine here, but this reads as what it is. */
export function easeOutCubic(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}
