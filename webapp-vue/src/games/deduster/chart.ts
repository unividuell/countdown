/**
 * The evaluation curve's arithmetic: level → x, milliseconds → y, a finger's x → the nearest level.
 * Pure, so the component has only drawing left to get wrong.
 */
import type { DedusterRow } from './scoreboard'
import { MIN_HUMAN_MS } from './types'

/** The SVG's own coordinate system; it scales with the card through `viewBox`. The bottom holds the
 * level ticks and the axis title under them. */
export const VIEW = { width: 320, height: 206, left: 26, right: 8, top: 8, bottom: 28 } as const

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
    maxMs: ceilingMs(input.intervalMs),
  }
}

/** The top of the game-over band: the curve's ceiling, and a tile chart's too. */
export function ceilingMs(intervalMs: number): number {
  return Math.round(intervalMs * (1 + BAND_SHARE))
}

/** One of the reactions that got a run marked implausible. */
export function implausibleMs(ms: number, intervalMs: number): boolean {
  return ms < MIN_HUMAN_MS || ms > intervalMs
}

/**
 * The points to mark on a marked run's line: the reactions that marked it. [below]: in the plot's
 * lower half the sign hangs under its point, in the upper half over it — away from where the lines
 * crowd, which is the middle.
 */
export function warningsOf(
  frame: Frame,
  row: Pick<DedusterRow, 'reactionsMs' | 'implausible'>,
): (Point & { below: boolean })[] {
  if (!row.implausible) return []
  const middle = (VIEW.top + VIEW.height - VIEW.bottom) / 2
  return row.reactionsMs.flatMap((ms, level) => {
    if (!implausibleMs(ms, frame.intervalMs)) return []
    const y = yOf(frame, ms)
    return [{ x: xOf(frame, level), y, below: y > middle }]
  })
}

/**
 * One player's bar in a tile's mini chart: a hit's time, a wrong tap's, or — a missed beat, as the
 * curve draws it — the ceiling. `null` keeps the player's slot empty.
 */
export type TileBar = {
  userId: string
  colorHex: string
  kind: 'hit' | 'wrong' | 'missed'
  ms: number
  warn: boolean
} | null

type BarRow = Pick<
  DedusterRow,
  | 'userId'
  | 'colorHex'
  | 'reactionsMs'
  | 'endedBy'
  | 'wrongTileIndex'
  | 'wrongReactionMs'
  | 'implausible'
>

/** The right tile of [level]: every player's hit there, or the beat they missed there. */
export function correctBars(input: {
  level: number
  rows: readonly BarRow[]
  intervalMs: number
}): TileBar[] {
  return input.rows.map((row) => {
    const ms = row.reactionsMs[input.level]
    if (ms !== undefined) {
      const warn = row.implausible && implausibleMs(ms, input.intervalMs)
      return { userId: row.userId, colorHex: row.colorHex, kind: 'hit', ms, warn }
    }
    if (row.endedBy === 'TOO_LATE' && row.reactionsMs.length === input.level) {
      const ms = ceilingMs(input.intervalMs)
      return { userId: row.userId, colorHex: row.colorHex, kind: 'missed', ms, warn: false }
    }
    return null
  })
}

/** A tile wrongly tapped at [level]: the wrong taps that landed on it, with their time. */
export function wrongBars(input: {
  level: number
  tile: number
  rows: readonly BarRow[]
}): TileBar[] {
  return input.rows.map((row) =>
    row.endedBy === 'WRONG_TILE' &&
    row.reactionsMs.length === input.level &&
    row.wrongTileIndex === input.tile &&
    row.wrongReactionMs !== null
      ? {
          userId: row.userId,
          colorHex: row.colorHex,
          kind: 'wrong',
          ms: row.wrongReactionMs,
          warn: false,
        }
      : null,
  )
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

/**
 * The run whose line — dashed ending included — passes within [radius] of [p]; `null` when none or
 * several do, so a tap in a crowd selects nobody rather than a guess.
 */
export function runAt(
  frame: Frame,
  rows: readonly Pick<DedusterRow, 'userId' | 'reactionsMs' | 'endedBy' | 'wrongReactionMs'>[],
  p: Point,
  radius: number,
): string | null {
  const near = rows.filter((row) => {
    const points: Point[] = row.reactionsMs.map((ms, level) => ({
      x: xOf(frame, level),
      y: yOf(frame, ms),
    }))
    const tail = tailOf(frame, row)
    if (tail !== null) points.push(tail.to)
    if (points.length === 1) return distance(p, points[0]!, points[0]!) <= radius
    return points.slice(1).some((to, i) => distance(p, points[i]!, to) <= radius)
  })
  return near.length === 1 ? near[0]!.userId : null
}

/** From [p] to the segment [a]–[b]. */
function distance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
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
