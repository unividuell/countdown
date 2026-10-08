/**
 * Beat 3, as Musterung plays it: the board steps back, the possibilities uncover block by block,
 * the board returns.
 *
 * Guess Hue fades a tolerance sector into the same window and is done in 300ms; this game has a
 * whole field to say it in, so it fills the 1000ms the shared clock leaves between the solution
 * and the results. Nothing here invents a beat — [SOLUTION_DELAY_MS] opens the window and
 * [RESULTS_DELAY_MS] closes it, and [RESTORE_AT_MS] is derived from the closing edge rather than
 * set, so the board is whole again exactly when the other players' outlines land on it.
 *
 *     900        1020  1140  1260        1440      1600            1900
 *      │           │     │     │           │         │               │
 *      ├─ block 0 ─┼─ 1 ─┼─ 2 ─┼─ 3 ───────┤         ├── board back ─┤
 *      │  of every possibility, in lockstep          │               │
 *      └─ board gone since 700 ───────────────────────┘         beat 4
 *
 * Pure, like `marks.ts`: happy-dom computes no layout, so an uncovering order expressed as numbers
 * is testable while the same order expressed as painted cells is not.
 */
import { RESULTS_DELAY_MS, SOLUTION_DELAY_MS } from '@/games/revealChoreography'

/** One cell of one possibility, as a surface over the board image. */
export interface PreviewTile {
  index: number
  /** The cell's own tone, so the tile and the board under it are the same colour. */
  hex: string
  /** When it uncovers — absolute, from the moment the reveal card mounts. */
  delayMs: number
}

/**
 * How much board is left while the possibilities uncover: none. The field clears completely, so
 * what stands in the frame is the tip you drew and the runs that would have counted — nothing to
 * read them against, and nothing to read them *past* either.
 */
export const RECEDED_OPACITY = 0

/**
 * The board leaves with the card swap — see `FindPatternGame`'s `<Transition>`, whose Tailwind
 * classes carry the same two numbers as literals because a class name cannot be computed. Changing
 * one without the other makes the field clear beside the swap instead of with it.
 */
export const RECEDE_DELAY_MS = 200
export const RECEDE_MS = 500

/** Between two blocks of the same possibility. Fast: this is an uncovering, not an entrance. */
export const TILE_STEP_MS = 120

export const TILE_FADE_MS = 180

export const RESTORE_MS = 300

/** Derived from beat 4, never set: the board must be whole when the outlines arrive on it. */
export const RESTORE_AT_MS = RESULTS_DELAY_MS - RESTORE_MS

/**
 * Every cell of every possibility, with the moment it uncovers.
 *
 * All possibilities move in lockstep — step *s* of each lands together — so the picture reads as
 * one pattern being written several times over, not as a list being walked. A cell shared by two
 * possibilities (which a periodic pattern produces: `[1,1,1,1]` matches at consecutive starts)
 * uncovers once, on the earlier of its two steps.
 */
export function previewTiles(input: {
  startIndices: readonly number[]
  patternLength: number
  blocks: readonly number[]
  palette: readonly string[]
}): PreviewTile[] {
  const earliestStep = new Map<number, number>()
  for (const start of input.startIndices) {
    for (let step = 0; step < input.patternLength; step++) {
      const index = start + step
      // A start index near the end of the board would run off it — the server never sends one,
      // but `solution` is `unknown` by contract and a stale round may be junk.
      if (index >= input.blocks.length) break
      const known = earliestStep.get(index)
      if (known === undefined || step < known) earliestStep.set(index, step)
    }
  }

  return [...earliestStep]
    .sort(([a], [b]) => a - b)
    .flatMap(([index, step]) => {
      const hex = input.palette[input.blocks[index]!]
      return hex === undefined
        ? []
        : [{ index, hex, delayMs: SOLUTION_DELAY_MS + step * TILE_STEP_MS }]
    })
}
