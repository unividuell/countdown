import type { PipeKindCode } from './types'

/**
 * A tile only ever turns clockwise, so its turn count grows without bound: the animation keeps
 * spinning the same way instead of unwinding. `rotationOf` folds it back to the 0..3 the server
 * knows.
 */
export function rotationOf(turns: number): number {
  return ((turns % 4) + 4) % 4
}

/**
 * The fewest further quarter turns from [turns] to look like [target]. A straight pipe looks the
 * same after a half turn, so it needs at most one.
 *
 *   turnTo(5, 0, 'ELBOW')    == 8   // 5 ≙ 1, three more
 *   turnTo(4, 3, 'STRAIGHT') == 5   // 3 ≙ 1, one is enough
 */
export function turnTo(turns: number, target: number, kind: PipeKindCode): number {
  const period = kind === 'STRAIGHT' ? 2 : 4

  const missing = (((target - turns) % period) + period) % period

  return turns + missing
}

export function rotationsOf(turns: readonly number[]): number[] {
  return turns.map(rotationOf)
}
