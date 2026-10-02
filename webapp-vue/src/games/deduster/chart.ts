/**
 * The evaluation curve's arithmetic: level → x, milliseconds → y, a finger's x → the nearest level.
 * Pure, so the component has only drawing left to get wrong.
 */
import type { DedusterRow } from './scoreboard'

/** The SVG's own coordinate system; it scales with the card through `viewBox`. The bottom holds the
 * level ticks and the axis title under them. */
export const VIEW = { width: 320, height: 206, left: 36, right: 8, top: 8, bottom: 28 } as const

/** Grid lines and their labels fall on every multiple of this, e.g. 300, 600, 900 … */
const GRID_STEP_MS = 300

/** Level ticks every fifth tile: 0, 5, 10 … — round numbers that show the count starts at 0. */
const TICK_STEP = 5

/** Closer than this to the floor's or the beat's label, a grid label would collide: it goes, the line stays. */
const LABEL_GAP = 10

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

/** Level 0 is the first tile; the axis ends at the last, level [tiles] − 1. */
export function xOf(frame: Frame, level: number): number {
  const span = VIEW.width - VIEW.left - VIEW.right
  return VIEW.left + (frame.tiles <= 1 ? 0 : (level / (frame.tiles - 1)) * span)
}

export function levelTicks(tiles: number): number[] {
  return Array.from({ length: Math.floor((tiles - 1) / TICK_STEP) + 1 }, (_, i) => i * TICK_STEP)
}

/** Every multiple of [GRID_STEP_MS] strictly between the floor and the beat, where the curve lives. */
export function gridMs(frame: Frame): number[] {
  const out: number[] = []
  for (
    let ms = Math.floor(frame.minMs / GRID_STEP_MS + 1) * GRID_STEP_MS;
    ms < frame.intervalMs;
    ms += GRID_STEP_MS
  )
    out.push(ms)
  return out
}

/** The y axis' numbers, bottom up: the floor, the grid lines with room for a label, the beat. */
export function yLabels(frame: Frame): number[] {
  const clear = (ms: number) =>
    Math.abs(yOf(frame, ms) - yOf(frame, frame.minMs)) >= LABEL_GAP &&
    Math.abs(yOf(frame, ms) - yOf(frame, frame.intervalMs)) >= LABEL_GAP
  return [frame.minMs, ...gridMs(frame).filter(clear), frame.intervalMs]
}

export function yOf(frame: Frame, ms: number): number {
  const span = VIEW.height - VIEW.top - VIEW.bottom
  return VIEW.top + ((frame.maxMs - ms) / (frame.maxMs - frame.minMs)) * span
}

export function polyline(frame: Frame, reactionsMs: readonly number[]): string {
  return reactionsMs.map((ms, level) => `${xOf(frame, level)},${yOf(frame, ms)}`).join(' ')
}

export interface Point {
  x: number
  y: number
}

/**
 * How a run ended, as one more step past its last reaction, at the level it ended on: a wrong tap
 * at its own time, a missed beat up to the top of the game-over band. `from` is `null` at level 0,
 * where there is no line to continue. A finished run, or a wrong tap without a time, has none.
 */
export function tailOf(
  frame: Frame,
  row: Pick<DedusterRow, 'reactionsMs' | 'endedBy' | 'wrongReactionMs'>,
): { from: Point | null; to: Point } | null {
  const level = row.reactionsMs.length
  const ms =
    row.endedBy === 'TOO_LATE'
      ? frame.maxMs
      : row.endedBy === 'WRONG_TILE'
        ? row.wrongReactionMs
        : null
  if (ms === null) return null
  const last = row.reactionsMs[level - 1]
  return {
    from: last === undefined ? null : { x: xOf(frame, level - 1), y: yOf(frame, last) },
    to: { x: xOf(frame, level), y: yOf(frame, ms) },
  }
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
