import { COORDINATE_LIMIT, MAX_PATH, MAX_POINTS, pathOf } from './types'
import type { Stroke } from './types'

/** A point closer than this to the last one kept falls away — a finger reports far more than it moves. */
export const MIN_STEP = 2

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** What a guess has used up of the server's budget. */
export interface Usage {
  points: number
  path: number
}

/**
 * A pointer position in canvas units, whatever size the canvas is rendered at. `rect` comes from
 * the moment of the event — a canvas that resized mid-stroke (rotation, keyboard) still maps right.
 * `null` for a rect without size.
 */
export function toUnits(
  clientX: number,
  clientY: number,
  rect: Rect,
  size: { width: number; height: number },
): [number, number] | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null

  return [
    Math.round(((clientX - rect.left) / rect.width) * size.width),
    Math.round(((clientY - rect.top) / rect.height) * size.height),
  ]
}

/**
 * Keeps [point] when the server would still take it, and tallies it into [usage]; otherwise
 * changes nothing. A finger that leaves the limits loses points there, and the stroke goes on
 * from the last kept point once it is back — what is sent is never invalid.
 */
export function appendPoint(
  points: number[],
  point: readonly [number, number],
  usage: Usage,
): boolean {
  const [x, y] = point
  if (Math.abs(x) > COORDINATE_LIMIT || Math.abs(y) > COORDINATE_LIMIT) return false
  if (usage.points >= MAX_POINTS) return false

  const lastX = points.at(-2)
  const lastY = points.at(-1)
  let step = 0
  if (lastX !== undefined && lastY !== undefined) {
    const dx = x - lastX
    const dy = y - lastY
    if (dx * dx + dy * dy < MIN_STEP * MIN_STEP) return false

    step = Math.abs(dx) + Math.abs(dy)
    if (usage.path + step > MAX_PATH) return false
  }

  points.push(x, y)
  usage.points += 1
  usage.path += step

  return true
}

/** What [strokes] have used up, counted the way the server counts: within a stroke, never across two. */
export function usageOf(strokes: readonly Stroke[]): Usage {
  const usage: Usage = { points: 0, path: 0 }

  for (const { points } of strokes) {
    usage.points += points.length / 2
    usage.path += pathOf(points)
  }

  return usage
}
