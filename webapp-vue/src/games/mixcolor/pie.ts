/**
 * The reveal's pie: slices share the circle by weight, one after the other from a random start, so
 * the first cut is rarely at 0°. A slice coming in grows its weight from 0 to 1, one leaving shrinks
 * to 0; the rest make room or close the gap.
 *
 *   start 23°, weights 1 · 1 · 0.5:  0.4 of the circle · 0.4 · 0.2
 *   [23°, 167°)  [167°, 311°)  [311°, 383°)
 */

export interface Wedge {
  from: number
  sweep: number
}

/** Each weight's wedge in degrees, in order from `start`. All weights zero: nothing to draw. */
export function wedges(weights: number[], start: number): Wedge[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let from = start

  return weights.map((weight) => {
    const sweep = total > 0 ? (weight / total) * 360 : 0
    const wedge = { from, sweep }
    from += sweep
    return wedge
  })
}

const point = (r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180
  return `${(Math.cos(rad) * r).toFixed(3)} ${(Math.sin(rad) * r).toFixed(3)}`
}

/**
 * A wedge as an SVG path around the origin. A whole circle is two half arcs: one arc cannot end
 * where it starts.
 */
export function wedgePath({ from, sweep }: Wedge, r: number): string {
  if (sweep >= 359.999) return `M${r} 0A${r} ${r} 0 1 1 ${-r} 0A${r} ${r} 0 1 1 ${r} 0Z`

  const large = sweep > 180 ? 1 : 0
  return `M0 0L${point(r, from)}A${r} ${r} 0 ${large} 1 ${point(r, from + sweep)}Z`
}

/** Where a wedge's marker sits: on its middle angle, `r` out. */
export function wedgeMid({ from, sweep }: Wedge, r: number) {
  const rad = ((from + sweep / 2) * Math.PI) / 180
  return { x: Math.cos(rad) * r, y: Math.sin(rad) * r }
}
