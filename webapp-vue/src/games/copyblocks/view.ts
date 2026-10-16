import type { Cell } from './field'

/** A point in cell units — the cell (x, y, z) spans x..x+1. */
export type Point3 = readonly [number, number, number]

/** Where a view looks from: an orbit around a point, and a zoom relative to the framed box's fit. */
export interface Camera {
  yaw: number
  pitch: number
  zoom: number
  /** The point orbited; `null` — the framed box's centre, until a zoom picks another. */
  target: Point3 | null
}

export const START_CAMERA: Camera = { yaw: 0.6, pitch: 0.45, zoom: 1, target: null }

/** Zoom limits, as multiples of the distance that fits the framed box. */
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 4

/**
 * [camera] zoomed by [factor] (below 1: closer) towards [anchor] — the point under the cursor or
 * between the fingers. Camera and orbit point both move along the line to it by the same ratio, so
 * the anchor stays where it is on screen. The orbit point stays inside [bounds], the framed box, so
 * zooming out at the edge cannot lose the field.
 *
 *   orbit' = anchor + (orbit − anchor) · step
 */
export function zoomedAt(
  camera: Camera,
  factor: number,
  anchor: Point3,
  centre: Point3,
  bounds: { lo: Point3; hi: Point3 },
): Camera {
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camera.zoom * factor))
  const step = zoom / camera.zoom
  if (step === 1) return camera

  const orbit = camera.target ?? centre
  const moved = [0, 1, 2].map((i) => {
    const v = anchor[i]! + (orbit[i]! - anchor[i]!) * step
    return Math.max(bounds.lo[i]!, Math.min(bounds.hi[i]!, v))
  })
  return { ...camera, zoom, target: [moved[0]!, moved[1]!, moved[2]!] }
}

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
