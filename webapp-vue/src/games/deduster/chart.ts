/**
 * The evaluation curve's arithmetic: level → x, milliseconds → y, a finger's x → the nearest level.
 * Pure, so the component has only drawing left to get wrong.
 */
import type { DedusterRow } from './scoreboard'

/** The SVG's own coordinate system; it scales with the card through `viewBox`. */
export const VIEW = { width: 320, height: 200, left: 36, right: 8, top: 8, bottom: 22 } as const

export interface Frame {
  tiles: number
  intervalMs: number
  minMs: number
  maxMs: number
}

/** Head room above the beat, so the game-over band has a visible height. */
const BAND_SHARE = 0.12

export function frameFor(input: {
  tiles: number
  intervalMs: number
  rows: readonly DedusterRow[]
}): Frame {
  const fastest = Math.min(input.intervalMs, ...input.rows.flatMap((r) => r.reactionsMs))
  return {
    tiles: input.tiles,
    intervalMs: input.intervalMs,
    minMs: Math.max(0, Math.floor(fastest / 100) * 100 - 100),
    maxMs: Math.round(input.intervalMs * (1 + BAND_SHARE)),
  }
}

export function xOf(frame: Frame, level: number): number {
  const span = VIEW.width - VIEW.left - VIEW.right
  return VIEW.left + (frame.tiles <= 1 ? 0 : (level / (frame.tiles - 1)) * span)
}

export function yOf(frame: Frame, ms: number): number {
  const span = VIEW.height - VIEW.top - VIEW.bottom
  return VIEW.top + ((frame.maxMs - ms) / (frame.maxMs - frame.minMs)) * span
}

export function polyline(frame: Frame, reactionsMs: readonly number[]): string {
  return reactionsMs.map((ms, level) => `${xOf(frame, level)},${yOf(frame, ms)}`).join(' ')
}

export function levelAt(frame: Frame, x: number): number {
  const span = VIEW.width - VIEW.left - VIEW.right
  const level = Math.round(((x - VIEW.left) / span) * (frame.tiles - 1))
  return Math.min(frame.tiles - 1, Math.max(0, level))
}

/**
 * The tiles somebody wrongly tapped at exactly [level], with who: a run that went wrong at level L
 * has L reactions. A timeout marks nothing — there is no tapped tile, and a dot on the right tile
 * would read as a hit.
 */
export function wrongTilesAt(
  level: number,
  rows: readonly DedusterRow[],
): { tile: number; players: { userId: string; colorHex: string }[] }[] {
  const byTile = new Map<number, { userId: string; colorHex: string }[]>()
  for (const row of rows) {
    if (row.endedBy !== 'WRONG_TILE' || row.wrongTileIndex === null || row.tilesCleared !== level)
      continue
    const players = byTile.get(row.wrongTileIndex) ?? []
    players.push({ userId: row.userId, colorHex: row.colorHex })
    byTile.set(row.wrongTileIndex, players)
  }
  return [...byTile.entries()].map(([tile, players]) => ({ tile, players }))
}
