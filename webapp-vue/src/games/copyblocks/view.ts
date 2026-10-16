import type { Cell } from './field'

/** Where a view looks from: an orbit around the framed box, and a zoom relative to its fit. */
export interface Camera {
  yaw: number
  pitch: number
  zoom: number
}

export const START_CAMERA: Camera = { yaw: 0.6, pitch: 0.45, zoom: 1 }

export interface Hit {
  /** The block under the finger, if any. */
  block: Cell | null
  /** The free cell in front of the touched face — or on the floor. */
  place: Cell | null
}

/** A finger that moves less than this (CSS px) taps; more, and it turns the view. */
export const TAP_SLOP_PX = 8

/** How long the reveal's one full turn takes. A first value, to be tuned in the lab. */
export const SPIN_MS = 3000

/**
 * The yaw [elapsedMs] into the reveal's turn from [start]: once around, eased in and out, and
 * exactly [start] again at the end — so a finished turn leaves no 2π behind in the camera.
 */
export function spunYaw(start: number, elapsedMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / SPIN_MS))
  if (t === 1) return start

  const eased = t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2
  return start + 2 * Math.PI * eased
}
