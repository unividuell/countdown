/**
 * The timings and proportions of the wheel, in one place so they can be tuned in the lab without
 * hunting through components.
 */

/** One full turn of the knob while the ring paints itself behind it. */
export const BOOT_SWEEP_MS = 800

/**
 * How far the painted ring trails the knob. This gap is the whole effect: it turns the knob into a
 * comet head and the ring into its trail. Too small and they move as one block.
 */
export const BOOT_TRAIL_MS = 70

/**
 * How long the confirm button must be held.
 *
 * The original held for 2000 ms, which reads long on the second attempt. This is the number to
 * turn while playing in the lab — it is the whole reason the lab exists.
 */
export const HOLD_MS = 1200

/**
 * The wheel is a thin rainbow band, not a filled disc — the original it is ported from is a ring
 * with an empty centre, and only the ring is grabbable. Both fractions are of the wheel's radius.
 */

/** The rainbow band's inner edge. Inside it the wheel is empty and not grabbable. */
export const BAND_INNER_FRACTION = 0.78

/** Where the knob rides — the middle of the band. */
export const KNOB_TRACK_FRACTION = 0.89
