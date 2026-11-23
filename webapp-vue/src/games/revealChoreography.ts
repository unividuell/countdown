/**
 * When a reveal happens, for every game: the beats after the card switches, and the cascade that
 * walks the scoreboard's cells.
 *
 * One module rather than one per game, because the coupling is the point: a marker on the picture
 * and its row in the table are the same event, and two copies of these numbers would be two
 * timetables drifting apart. What stays with a game is *what* moves — lanes on a wheel, outlines on
 * a grid — never *when*.
 *
 * The numbers were first proposed in Guess Hue's reveal and turned in the lab; they are still
 * proposals, and the lab is still where they get turned.
 */
import { inBackground, prefersReducedMotion } from '@/ui/motion'

/**
 * Whether a reveal skips its beats and just is there: on a reload (`animate` false), under reduced
 * motion, in a background tab, or without animation frames (happy-dom). Asked once, when the
 * choreography would start — not reactively.
 */
export function isStill(animate: boolean): boolean {
  return (
    !animate ||
    prefersReducedMotion() ||
    inBackground() ||
    typeof requestAnimationFrame !== 'function'
  )
}

/** Beat 3: the solution appears — Guess Hue's tolerance sector, Musterung's possibilities. */
export const SOLUTION_DELAY_MS = 900

/** Beat 4: the results start landing, row by row with their marker. */
export const RESULTS_DELAY_MS = 1900

/**
 * How long the verdict sounds, from its call to the last knock's ring (`ui/verdictSound`). My row
 * lands with it, the others' only once it has rung out: no marker's knock sounds into it
 * (Farbausmalung).
 */
export const VERDICT_MS = 550

export const FADE_MS = 300

/** Beat 3 writes the scoreboard's head at the same moment the solution appears. */
export const HEAD_DELAY_MS = SOLUTION_DELAY_MS

/** Between the columns of one row — the typewriter's step. */
export const CELL_STAGGER_MS = 45

/**
 * Between rows. Deliberately shorter than a row is wide (3 · [CELL_STAGGER_MS]), so the cascades
 * overlap and the table flows instead of stuttering row by row.
 */
export const ROW_STAGGER_MS = 120

/** The row cascade never runs longer than this, however many people played. */
export const TYPE_BUDGET_MS = 1200

/** The column a marker rides with: the guess cell, because both are „the guess“. */
export const TIP_COLUMN = 1

/**
 * How far apart two rows are. [ROW_STAGGER_MS] below the budget, and whatever fits above it.
 */
export function rowStagger(rowCount: number): number {
  return Math.min(ROW_STAGGER_MS, TYPE_BUDGET_MS / Math.max(1, rowCount))
}

/** A cell of the scoreboard's head. */
export function headCellDelayMs(row: number, column: number): number {
  return HEAD_DELAY_MS + row * ROW_STAGGER_MS + column * CELL_STAGGER_MS
}

/**
 * A cell of the scoreboard's body — and, at [TIP_COLUMN], the matching marker on the picture. One
 * function for both is the whole point of the coupling: there is no second timetable to drift.
 * `resultsDelayMs` moves the whole cascade, for a picture that runs past beat 4 (Augenmaß's count).
 *
 *   tick 0 (mine) ─ VERDICT_MS ─ tick 1 ─ rowStagger ─ tick 2 ─ …
 */
export function cellDelayMs(
  tick: number,
  column: number,
  rowCount: number,
  resultsDelayMs = RESULTS_DELAY_MS,
): number {
  const rowStart = tick === 0 ? 0 : VERDICT_MS + (tick - 1) * rowStagger(rowCount)

  return resultsDelayMs + rowStart + column * CELL_STAGGER_MS
}

/**
 * Which tick a row rides. Mine is first and alone: it lands with the verdict, which is the signal
 * for my points. The others follow in rank order. Without a row of mine the first tick stays empty,
 * so every table keeps one timetable.
 *
 *   ranks 0 1 2 3, mine 2  →  ticks 1 2 0 3
 */
export function tickOfRow(rank: number, myRank: number | null): number {
  if (rank === myRank) return 0

  return myRank !== null && rank > myRank ? rank : rank + 1
}
