/**
 * Where a wave is, and where a tap during it puts a ring. Pure: the field passes the clock in.
 *
 *   ping ● ·········○ ← the wave, `(now − start) × speed` cells out, until `reach`
 *            ring ◌ ← a tap at `t` leaves the wave's radius of that moment
 */
import type { Point } from './types'

/** How far a wave started at `startMs` has come at `atMs`; `null` before it started. */
function travelled(startMs: number, atMs: number, speed: number): number | null {
  return atMs < startMs ? null : ((atMs - startMs) / 1000) * speed
}

/** The wave's radius in cells; `null` before its start and once it has passed `reach`. */
export function waveRadius(
  startMs: number,
  nowMs: number,
  speed: number,
  reach: number,
): number | null {
  const radius = travelled(startMs, nowMs, speed)

  return radius === null || radius > reach ? null : radius
}

/**
 * The radius of the ring a tap at `tapMs` leaves; `null` before the wave's start. Not capped at
 * `reach`: a tap in the afterglow may land beyond it, and the server takes rings up to twice
 * the field.
 */
export function ringRadius(startMs: number, tapMs: number, speed: number): number | null {
  return travelled(startMs, tapMs, speed)
}

/** A pointer position as a point in the field, in cell units and clamped to `[0, grid]`. */
export function toCell(clientX: number, clientY: number, rect: DOMRect, grid: number): Point {
  // A field without size yet (hidden, not laid out) has no cell to point at: the corner, not NaN.
  return {
    x: clamp(rect.width > 0 ? ((clientX - rect.left) / rect.width) * grid : 0, grid),
    y: clamp(rect.height > 0 ? ((clientY - rect.top) / rect.height) * grid : 0, grid),
  }
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max)
}
