import { isBlockCode } from './blockTypes'
import type { BlockCode } from './blockTypes'
import type { Fit } from './fit'

/**
 * What the server sends, narrowed by hand. `payload`, `outcome` and every stored guess arrive as
 * `unknown` by contract, and a stale round may be junk — narrowing here is what keeps a white
 * block (unknown code) and `NaN` out of the picture.
 */

/** The server's limits for a guess; the board refuses what would be rejected. */
export const MAX_GUESS_BLOCKS = 200
export const MAX_COORDINATE = 64

export interface GuessBlock {
  x: number
  y: number
  z: number
  type: BlockCode
}

export interface CopyBlocksPayload {
  grid: number
  types: BlockCode[]
  blocks: GuessBlock[]
}

export interface CopyBlocksOutcome {
  correct: boolean
  fit: Fit
  missing: GuessBlock[]
  extra: GuessBlock[]
  wrongType: GuessBlock[]
}

export interface CopyBlocksGuess {
  blocks: GuessBlock[]
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function asBlock(value: unknown): GuessBlock | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y, z, type } = value as Partial<Record<keyof GuessBlock, unknown>>
  if (!isWhole(x) || !isWhole(y) || !isWhole(z) || !isBlockCode(type)) return null

  return { x, y, z, type }
}

/** The blocks that are one; `null` when [value] is no list at all. */
function asBlocks(value: unknown): GuessBlock[] | null {
  if (!Array.isArray(value)) return null

  return value.map(asBlock).filter((block): block is GuessBlock => block !== null)
}

function asFit(value: unknown): Fit | null {
  if (typeof value !== 'object' || value === null) return null
  const { turns, dx, dy, dz } = value as Partial<Record<keyof Fit, unknown>>
  if (!isWhole(turns) || !isWhole(dx) || !isWhole(dy) || !isWhole(dz)) return null
  if (turns < 0 || turns > 3) return null

  return { turns, dx, dy, dz }
}

export function asCopyBlocksPayload(value: unknown): CopyBlocksPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const { grid, types, blocks } = value as Partial<Record<keyof CopyBlocksPayload, unknown>>
  if (!isWhole(grid) || grid < 1 || !Array.isArray(types)) return null

  const known = types.filter(isBlockCode)
  const drawn = asBlocks(blocks)
  if (known.length === 0 || drawn === null || drawn.length === 0) return null

  return { grid, types: known, blocks: drawn }
}

export function asCopyBlocksOutcome(value: unknown): CopyBlocksOutcome | null {
  if (typeof value !== 'object' || value === null) return null
  const { correct, fit, missing, extra, wrongType } = value as Partial<
    Record<keyof CopyBlocksOutcome, unknown>
  >
  if (typeof correct !== 'boolean') return null

  const placed = asFit(fit)
  const lacking = asBlocks(missing)
  const surplus = asBlocks(extra)
  const mistyped = asBlocks(wrongType)
  if (placed === null || lacking === null || surplus === null || mistyped === null) return null

  return { correct, fit: placed, missing: lacking, extra: surplus, wrongType: mistyped }
}

export function asCopyBlocksGuess(value: unknown): CopyBlocksGuess | null {
  if (typeof value !== 'object' || value === null) return null
  const blocks = asBlocks((value as Partial<CopyBlocksGuess>).blocks)
  if (blocks === null || blocks.length === 0) return null

  return { blocks }
}
