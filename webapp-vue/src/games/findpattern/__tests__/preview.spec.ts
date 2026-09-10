import { describe, expect, it } from 'vitest'
import { RESULTS_DELAY_MS, SOLUTION_DELAY_MS } from '@/games/revealChoreography'
import {
  RESTORE_AT_MS,
  TILE_FADE_MS,
  TILE_STEP_MS,
  previewTiles,
} from '@/games/findpattern/preview'

const PALETTE = ['#ffffff', '#cccccc', '#999999', '#666666']

/** 24 cells, tone = index % 4 — so a cell's tone is readable straight off its index. */
const BLOCKS = Array.from({ length: 24 }, (_, index) => index % 4)

function tiles(startIndices: number[], over: { blocks?: number[]; patternLength?: number } = {}) {
  return previewTiles({
    startIndices,
    patternLength: over.patternLength ?? 4,
    blocks: over.blocks ?? BLOCKS,
    palette: PALETTE,
  })
}

describe('previewTiles', () => {
  it('covers every cell of a possibility, in that cell’s own tone', () => {
    const cells = tiles([8])

    expect(cells.map((tile) => tile.index)).toEqual([8, 9, 10, 11])
    expect(cells.map((tile) => tile.hex)).toEqual(['#ffffff', '#cccccc', '#999999', '#666666'])
  })

  it('starts the cascade on beat 3, one step per block', () => {
    const cells = tiles([8])

    expect(cells.map((tile) => tile.delayMs)).toEqual([
      SOLUTION_DELAY_MS,
      SOLUTION_DELAY_MS + TILE_STEP_MS,
      SOLUTION_DELAY_MS + 2 * TILE_STEP_MS,
      SOLUTION_DELAY_MS + 3 * TILE_STEP_MS,
    ])
  })

  /** The whole point of the choreography: two possibilities uncover in lockstep, not in sequence. */
  it('uncovers the same step of every possibility at the same moment', () => {
    const cells = tiles([0, 8])

    const byIndex = new Map(cells.map((tile) => [tile.index, tile.delayMs]))
    expect(byIndex.get(0)).toBe(byIndex.get(8))
    expect(byIndex.get(3)).toBe(byIndex.get(11))
  })

  /**
   * A periodic pattern (`[1,1,1,1]`) matches at consecutive starts, so one cell belongs to two
   * possibilities. It can only uncover once — at the earlier of the two moments.
   */
  it('uncovers a shared cell on its earliest step', () => {
    const cells = tiles([4, 5], { blocks: Array.from({ length: 24 }, () => 1) })

    // Cell 5 opens the second possibility (step 0) and continues the first (step 1) — it uncovers
    // once, with the second's step 0.
    expect(cells.map((tile) => tile.delayMs)).toEqual(
      [0, 0, 1, 2, 3].map((step) => SOLUTION_DELAY_MS + step * TILE_STEP_MS),
    )
    expect(cells.map((tile) => tile.index)).toEqual([4, 5, 6, 7, 8])
  })

  it('leaves out a cell the board does not have', () => {
    const cells = tiles([22])

    expect(cells.map((tile) => tile.index)).toEqual([22, 23])
  })

  it('draws nothing when the round has no possibilities', () => {
    expect(tiles([])).toEqual([])
  })

  /**
   * The invariant the whole budget rests on: the board is whole again before beat 4 lands the
   * other players' outlines on it. If `PATTERN_LENGTH` ever grows, this is what says so.
   */
  it('finishes the cascade before the board comes back', () => {
    const last = tiles([8]).reduce((latest, tile) => Math.max(latest, tile.delayMs), 0)

    expect(last + TILE_FADE_MS).toBeLessThanOrEqual(RESTORE_AT_MS)
  })

  it('has the board whole again exactly when the results land', () => {
    expect(RESTORE_AT_MS).toBeLessThan(RESULTS_DELAY_MS)
  })
})
