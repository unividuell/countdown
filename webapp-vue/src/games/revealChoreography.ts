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

/** Beat 3: the solution appears — Guess Hue's tolerance sector, Musterung's possibilities. */
export const SOLUTION_DELAY_MS = 900

/** Beat 4: the results start landing, row by row with their marker. */
export const RESULTS_DELAY_MS = 1900

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
 */
export function cellDelayMs(tick: number, column: number, rowCount: number): number {
  return RESULTS_DELAY_MS + tick * rowStagger(rowCount) + column * CELL_STAGGER_MS
}

/**
 * Which tick a row borrows its timing from. Every row rides its own rank — except the viewer's.
 *
 * My own marker is already on the picture when the reveal starts, so a row appearing with it would
 * say „I am not the best“ from its slot alone, before a single rival had been shown. Mine therefore
 * waits for the first foreign marker: rank 1 when I am rank 0, rank 0 otherwise. Alone in the round
 * there is nothing to give away.
 */
export function tickOfRow(rank: number, myRank: number | null, rowCount: number): number {
  if (myRank === null || rank !== myRank) return rank
  if (rowCount <= 1) return 0
  return myRank === 0 ? 1 : 0
}
