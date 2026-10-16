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
