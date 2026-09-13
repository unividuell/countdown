/**
 * The contract between a game and the shared scoreboard — see `RevealScoreboard.vue`.
 */

/** What every game's row has to say before the table can rank it, colour it and time it. */
export interface ScoreboardRow {
  userId: string
  name: string
  /** The player's own colour — the row's ground, the same one their avatar has above the card. */
  colorHex: string
  /** Ink that reads against [colorHex]. */
  ink: string
  points: number | null
  /** Whether [points] can still be overtaken — see `isProvisional` in `@/games/awards`. */
  provisional: boolean
  /**
   * Which tick of the reveal cascade this row's timing comes from. Its rank, except for the
   * viewer's own row — see `tickOfRow`.
   */
  tick: number
}

/**
 * One column between „Name“ and „Pkt“, which the table frames but never fills: what a tip *is*
 * differs per game — a number, a chip row, a play button — and lives in the `cell-<key>` slot.
 */
export interface ScoreboardColumn<Row extends ScoreboardRow> {
  /** Names the slot that fills this column's body cells: `cell-<key>`. */
  key: string
  label: string
  /** CSS width for the `<col>`. Omitted, the column takes what the fixed ones leave over. */
  width?: string
  align?: 'start' | 'end'
  /** `tabular-nums`, so a column of numbers keeps one axis. */
  numeric?: boolean
  /**
   * The cell's own surface, where it differs from the row's — Farbausmalung paints the guess
   * itself. Returning `null` leaves the cell bare, ground and padding both, for content that
   * brings its own (Musterung's chips are a pattern, not a row of cells).
   */
  ground?: (row: Row) => { backgroundColor: string; color: string } | null
}
