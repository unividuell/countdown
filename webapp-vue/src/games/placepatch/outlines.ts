/**
 * Every tip on the board as one box. A tip on the same cell as an earlier one moves
 * [OUTLINE_STEP_PX] inwards per collision, so both stay visible — Musterung's rule.
 *
 * The order of the sources decides who sits outside: the caller puts the viewer's own tip first, so
 * it keeps the box it had while they were playing.
 */
import type { Cell } from './types'

export interface OutlineSource {
  userId: string
  cell: Cell
  colorHex: string
  /** When this box fades in — from the shared reveal choreography, never invented here. */
  delayMs: number
}

export interface Outline extends OutlineSource {
  insetPx: number
}

export const OUTLINE_STEP_PX = 2

export function stackedOutlines(
  sources: readonly OutlineSource[],
  stepPx: number = OUTLINE_STEP_PX,
): Outline[] {
  const taken = new Map<string, number>()
  return sources.map((source) => {
    const key = `${source.cell.x},${source.cell.y}`
    const collisions = taken.get(key) ?? 0
    taken.set(key, collisions + 1)
    return { ...source, insetPx: collisions * stepPx }
  })
}
