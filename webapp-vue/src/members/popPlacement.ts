/*
 * The member pop: my roster column, shown away from the roster when my own is out of view.
 *
 *   ┌ viewport ─────────────────────────┐
 *   │      ┊   ●🔥  ┊       y: top quarter, the column whole
 *   │  ←96→┊        ┊←96→   x: column ± 96, clamped
 *   │ ─ ─ ─┊─ ─ ─ ─ ┊─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
 *   │      ┊  game  ┊                   │
 *   └───────────────────────────────────┘
 *
 * Coordinates are viewport pixels. The spot is the avatar's centre.
 */

export const POP_SCALE = 1.5

/** Desktop room beside the content column; a phone's viewport clamps it away. */
const SPREAD = 96
const EDGE = 16
/**
 * The column at ×1.5, from the circle's centre: the circle's 36 to the left, the 26px icon at its
 * flare's widest (×1.06) and tallest (×1.38) 43 right and 76 above, the points below it 66 down.
 */
const LEFT = 36
const RIGHT = 43
const ABOVE = 76
const BELOW = 66

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

interface Viewport {
  width: number
  height: number
}

/** Whether the whole circle shows: inside the viewport, and sideways inside the row that clips it. */
export function inView(circle: Box, row: Box, viewport: Viewport): boolean {
  return (
    circle.top >= 0 &&
    circle.bottom <= viewport.height &&
    circle.left >= Math.max(0, row.left) &&
    circle.right <= Math.min(viewport.width, row.right)
  )
}

/** A random centre in the top quarter near the column, with the whole pop clear of every edge. */
export function popSpot(
  column: { left: number; right: number },
  viewport: Viewport,
  rng: () => number = Math.random,
): { x: number; y: number } {
  const xFrom = Math.max(column.left - SPREAD, EDGE + LEFT)
  const xTo = Math.min(column.right + SPREAD, viewport.width - EDGE - RIGHT)
  const yFrom = EDGE + ABOVE
  // A quarter shorter than the flare needs keeps the topmost spot that still shows it whole.
  const yTo = Math.max(yFrom, Math.min(viewport.height / 4, viewport.height - EDGE - BELOW))

  return {
    x: xFrom <= xTo ? xFrom + rng() * (xTo - xFrom) : viewport.width / 2,
    y: yFrom + rng() * (yTo - yFrom),
  }
}
