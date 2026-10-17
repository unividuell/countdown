/**
 * What the server sends, narrowed by hand. `payload`, `solution` and every stored guess arrive as
 * `unknown` by contract, and a stale round may be junk — narrowing here is what keeps `NaN` and a
 * box beside the board out of the picture.
 */

/** The round's asset names — both sealed from stage 0, opened by the reveal. */
export const BOARD_ASSET = 'board'
export const PATCH_ASSET = 'patch'

export interface PlacePatchPayload {
  cols: number
  rows: number
  size: number
}

/** The board under the cover — the server's `PlacePatchScene`: the payload's numbers, sent earlier. */
export type PlacePatchScene = PlacePatchPayload

export interface PlacePatchSolution {
  x: number
  y: number
}

/** The top-left cell of a patch or a stamp. */
export interface Cell {
  x: number
  y: number
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export function asPlacePatchPayload(value: unknown): PlacePatchPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const { cols, rows, size } = value as Partial<PlacePatchPayload>
  if (!isWhole(cols) || !isWhole(rows) || !isWhole(size)) return null
  if (size < 1 || size > cols || size > rows) return null
  return { cols, rows, size }
}

export function asPlacePatchScene(value: unknown): PlacePatchScene | null {
  return asPlacePatchPayload(value)
}

/** A cell where a whole patch fits on [layout], or `null` — a give-up has none, nor has junk. */
export function cellOf(value: unknown, layout: PlacePatchPayload | null): Cell | null {
  if (layout === null || typeof value !== 'object' || value === null) return null
  const { x, y } = value as Partial<Cell>
  if (!isWhole(x) || !isWhole(y)) return null
  if (x < 0 || y < 0 || x > layout.cols - layout.size || y > layout.rows - layout.size) return null
  return { x, y }
}

export function asPlacePatchSolution(
  value: unknown,
  layout: PlacePatchPayload | null,
): PlacePatchSolution | null {
  return cellOf(value, layout)
}
