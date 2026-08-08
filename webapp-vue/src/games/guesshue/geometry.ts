/**
 * The wheel's arithmetic, kept out of the component on purpose: happy-dom computes no layout, so
 * `getBoundingClientRect()` answers zeroes there and pointer maths is untestable inside a mounted
 * component. Here it can be tested against a box we state ourselves.
 */

/** The part of a `DOMRect` the wheel needs. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Folds any angle onto `[0, 360)`. `%` alone keeps the sign, which puts the knob nowhere. */
export function wrap360(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/**
 * The angle from the box's centre to the point, in degrees **clockwise from the top** — the same
 * origin and direction as CSS `conic-gradient`, so the ring needs no offset.
 *
 * `atan2` measures from the positive x axis, and screen y grows downwards, which already makes it
 * clockwise; `+ 90` moves the origin from the right to the top.
 */
export function angleFromPoint(x: number, y: number, box: Box): number {
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  return wrap360((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90)
}

/**
 * How far the point sits from the centre, as a fraction of the wheel's radius — 0 at the centre,
 * 1 at the edge. Used for the dead zone: near the centre a millimetre of finger movement is a
 * ninety-degree jump in [angleFromPoint].
 */
export function radiusFraction(x: number, y: number, box: Box): number {
  const radius = Math.min(box.width, box.height) / 2
  if (radius <= 0) return 0
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  return Math.hypot(x - cx, y - cy) / radius
}

/**
 * German colour names on a 30° grid.
 *
 * This is screen-reader parity, not a hint: whoever sees the wheel reads the same information off
 * the colour in its centre. The grid stays coarse for exactly that reason — a finer vocabulary
 * would tell a screen-reader user more than the picture does.
 */
const HUE_NAMES = [
  'Rot',
  'Orange',
  'Gelb',
  'Gelbgrün',
  'Grün',
  'Blaugrün',
  'Türkis',
  'Azurblau',
  'Blau',
  'Violett',
  'Magenta',
  'Pink',
] as const

export function hueName(hue: number): string {
  return HUE_NAMES[Math.round(wrap360(hue) / 30) % HUE_NAMES.length]!
}
