/**
 * What the server sends, narrowed by hand. `payload`, `outcome` and every stored guess arrive as
 * `unknown` by contract, and a stale round may be junk — narrowing here keeps an unknown mark and
 * `NaN` out of the picture.
 */
import type { TowerGeometry } from './tower'

export type StackFloorMark = 'RESTARTED' | 'SUBMITTED_BEFORE_RUN_END'

export interface StackFloorScene {
  fieldWidth: number
  startWidth: number
  hueStart: number
}

export interface StackFloorPayload {
  fieldWidth: number
  startWidth: number
  speedNum: number
  speedDen: number
  pauseMs: number
  maxFloors: number
  hueStart: number
  /** The floor that earns the point in phase one; `null` in phase two. */
  target: number | null
  accelPercent: number
}

export interface StackFloorOutcome {
  height: number
  marks: StackFloorMark[]
}

/** Click times in ms since their floor began, one per floor. */
export interface StackFloorGuess {
  clicks: number[]
  restarted: boolean
}

const MARKS: readonly string[] = ['RESTARTED', 'SUBMITTED_BEFORE_RUN_END']

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isCount(value: unknown): value is number {
  return isWhole(value) && value >= 0
}

function isLength(value: unknown): value is number {
  return isWhole(value) && value > 0
}

function isMark(value: unknown): value is StackFloorMark {
  return typeof value === 'string' && MARKS.includes(value)
}

export function asStackFloorScene(value: unknown): StackFloorScene | null {
  if (typeof value !== 'object' || value === null) return null
  const { fieldWidth, startWidth, hueStart } = value as Partial<
    Record<keyof StackFloorScene, unknown>
  >
  if (!isLength(fieldWidth) || !isLength(startWidth) || !isCount(hueStart)) return null

  return { fieldWidth, startWidth, hueStart }
}

export function asStackFloorPayload(value: unknown): StackFloorPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Partial<Record<keyof StackFloorPayload, unknown>>
  const { fieldWidth, startWidth, speedNum, speedDen, pauseMs, maxFloors, hueStart, target, accelPercent } =
    raw
  if (!isLength(fieldWidth) || !isLength(startWidth)) return null
  if (!isLength(speedNum) || !isLength(speedDen)) return null
  if (!isCount(pauseMs) || !isLength(maxFloors) || !isCount(hueStart)) return null
  if (!(target === null || isCount(target)) || !isCount(accelPercent)) return null

  return {
    fieldWidth,
    startWidth,
    speedNum,
    speedDen,
    pauseMs,
    maxFloors,
    hueStart,
    target,
    accelPercent,
  }
}

export function asStackFloorOutcome(value: unknown): StackFloorOutcome | null {
  if (typeof value !== 'object' || value === null) return null
  const { height, marks } = value as Partial<Record<keyof StackFloorOutcome, unknown>>
  if (!isCount(height) || !Array.isArray(marks) || !marks.every(isMark)) return null

  return { height, marks }
}

export function asStackFloorGuess(value: unknown): StackFloorGuess | null {
  if (typeof value !== 'object' || value === null) return null
  const { clicks, restarted } = value as Partial<Record<keyof StackFloorGuess, unknown>>
  if (!Array.isArray(clicks) || !clicks.every(isCount)) return null

  return { clicks, restarted: restarted === true }
}

export function geometryOf(payload: StackFloorPayload): TowerGeometry {
  return {
    fieldWidth: payload.fieldWidth,
    startWidth: payload.startWidth,
    speedNum: payload.speedNum,
    speedDen: payload.speedDen,
    accelPercent: payload.accelPercent,
    maxFloors: payload.maxFloors,
  }
}
