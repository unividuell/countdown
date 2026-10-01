/**
 * What the server sends, narrowed by hand: `scene`, `payload` and every stored guess arrive as
 * `unknown`, and a stale round may be junk.
 */

export interface DedusterScene {
  cols: number
  rows: number
  /** One beat: how long a tile stays hot, and the count-in's step. */
  intervalMs: number
}

export interface DedusterPayload extends DedusterScene {
  /** The order tiles are dusted off in. Never rendered beyond the tiles already fallen. */
  order: number[]
}

export type DedusterEnd = 'COMPLETE' | 'TOO_LATE' | 'WRONG_TILE'

const ENDS: readonly DedusterEnd[] = ['COMPLETE', 'TOO_LATE', 'WRONG_TILE']

export interface DedusterGuessWire {
  reactionsMs: number[]
  endedBy: DedusterEnd
  wrongTileIndex: number | null
  restarted: boolean
}

export interface DedusterOutcome {
  tilesCleared: number
  endedBy: DedusterEnd
  wrongTileIndex: number | null
  averageReactionMs: number | null
  implausible: boolean
  restarted: boolean
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isEnd(value: unknown): value is DedusterEnd {
  return typeof value === 'string' && (ENDS as readonly string[]).includes(value)
}

function isIntegerOrNull(value: unknown): value is number | null {
  return value === null || isInteger(value)
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function asDedusterScene(value: unknown): DedusterScene | null {
  const v = record(value)
  if (v === null || !isInteger(v.cols) || !isInteger(v.rows) || !isInteger(v.intervalMs))
    return null
  if (v.cols <= 0 || v.rows <= 0 || v.intervalMs <= 0) return null
  return { cols: v.cols, rows: v.rows, intervalMs: v.intervalMs }
}

export function asDedusterPayload(value: unknown): DedusterPayload | null {
  const scene = asDedusterScene(value)
  const order = record(value)?.order
  if (scene === null || !Array.isArray(order)) return null
  const tiles = scene.cols * scene.rows
  // A permutation of the grid, or the board would light a tile twice or never reach one.
  if (order.length !== tiles || !order.every(isInteger)) return null
  if (new Set(order).size !== tiles || order.some((tile) => tile < 0 || tile >= tiles)) return null
  return { ...scene, order }
}

export function asDedusterGuess(value: unknown): DedusterGuessWire | null {
  const v = record(value)
  if (v === null || !Array.isArray(v.reactionsMs) || !v.reactionsMs.every(isInteger)) return null
  if (!isEnd(v.endedBy) || !isIntegerOrNull(v.wrongTileIndex) || typeof v.restarted !== 'boolean')
    return null
  return {
    reactionsMs: v.reactionsMs,
    endedBy: v.endedBy,
    wrongTileIndex: v.wrongTileIndex,
    restarted: v.restarted,
  }
}

export function asDedusterOutcome(value: unknown): DedusterOutcome | null {
  const v = record(value)
  if (
    v === null ||
    !isInteger(v.tilesCleared) ||
    !isEnd(v.endedBy) ||
    !isIntegerOrNull(v.wrongTileIndex)
  )
    return null
  const average = v.averageReactionMs
  if (average !== null && !(typeof average === 'number' && Number.isFinite(average))) return null
  if (typeof v.implausible !== 'boolean' || typeof v.restarted !== 'boolean') return null
  return {
    tilesCleared: v.tilesCleared,
    endedBy: v.endedBy,
    wrongTileIndex: v.wrongTileIndex,
    averageReactionMs: average,
    implausible: v.implausible,
    restarted: v.restarted,
  }
}
