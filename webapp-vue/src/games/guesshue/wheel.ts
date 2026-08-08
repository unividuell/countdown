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
 * The wheel is a thin rainbow band, not a filled disc — the original it is ported from is a ring
 * with an empty centre, and only the ring is grabbable. Both fractions are of the wheel's radius.
 */

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
