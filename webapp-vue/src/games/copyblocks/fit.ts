import type { Cell } from './field'

/**
 * How a guess sits on the template: `template = turn(guess, turns) + (dx, dy, dz)`, one quarter
 * turn about the vertical mapping `(x, y, z)` to `(z, y, -x)`. The counterpart of Kotlin's
 * `copyblocks/Fit.kt`; both read `shared/copy-blocks/fit.json`.
 */
export interface Fit {
  turns: number
  dx: number
  dy: number
  dz: number
}

export const IDENTITY: Fit = { turns: 0, dx: 0, dy: 0, dz: 0 }

// Negates as `0 - v`: `-v` turns a 0 into -0, which is not `toEqual` to 0.
function turned([x, y, z]: Cell, quarters: number): Cell {
  switch (quarters) {
    case 0:
      return [x, y, z]
    case 1:
      return [z, y, 0 - x]
    case 2:
      return [0 - x, y, 0 - z]
    default:
      return [0 - z, y, x]
  }
}

/** Turns, then shifts. */
export function toTemplate(fit: Fit, cell: Cell): Cell {
  const [x, y, z] = turned(cell, fit.turns)

  return [x + fit.dx, y + fit.dy, z + fit.dz]
}

/** Shifts back, then turns the remaining way round to a full circle. */
export function toGuess(fit: Fit, cell: Cell): Cell {
  const [x, y, z] = cell

  return turned([x - fit.dx, y - fit.dy, z - fit.dz], (4 - fit.turns) % 4)
}
