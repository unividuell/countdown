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
 * The dead zone in the wheel's centre, as a fraction of the radius. It is the confirm button's own
 * radius: the button covers 30 % of the wheel's width, so what it catches, the wheel ignores.
 */
export const DEAD_ZONE_FRACTION = 0.3
