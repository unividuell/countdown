import { describe, expect, it } from 'vitest'
import {
  cellDelayMs,
  CELL_STAGGER_MS,
  FADE_MS,
  headCellDelayMs,
  RESULTS_DELAY_MS,
  rowStagger,
  ROW_STAGGER_MS,
  tickOfRow,
  TYPE_BUDGET_MS,
} from '@/games/revealChoreography'

describe('the reveal schedule', () => {
  it('walks a row left to right and the rows top to bottom', () => {
    expect(cellDelayMs(0, 0, 3)).toBe(RESULTS_DELAY_MS)
    expect(cellDelayMs(0, 3, 3)).toBe(RESULTS_DELAY_MS + 3 * CELL_STAGGER_MS)
    expect(cellDelayMs(2, 0, 3)).toBe(RESULTS_DELAY_MS + 2 * ROW_STAGGER_MS)
  })

  it('overlaps the cascades: a row starts before the row above it has finished', () => {
    // 120 < 3 * 45 — that is what makes it flow instead of stutter.
    expect(ROW_STAGGER_MS).toBeLessThan(3 * CELL_STAGGER_MS)
  })

  it('compresses the rows once the budget binds, instead of lengthening the round', () => {
    expect(rowStagger(3)).toBe(ROW_STAGGER_MS)
    expect(rowStagger(10)).toBe(ROW_STAGGER_MS)
    expect(rowStagger(20)).toBe(TYPE_BUDGET_MS / 20)
    // No row count may make the cascade longer than the budget.
    for (const rowCount of [1, 2, 5, 10, 25, 100]) {
      expect((rowCount - 1) * rowStagger(rowCount)).toBeLessThanOrEqual(TYPE_BUDGET_MS)
    }
  })

  it('survives an empty table without dividing by zero', () => {
    expect(rowStagger(0)).toBe(ROW_STAGGER_MS)
  })

  it('finishes the head before the results beat starts', () => {
    // Three head rows, four columns; the last one must have faded out before beat 4.
    expect(headCellDelayMs(2, 3) + FADE_MS).toBeLessThan(RESULTS_DELAY_MS)
  })
})

describe('tickOfRow', () => {
  it('gives every other row its own rank', () => {
    expect(tickOfRow(0, 2, 4)).toBe(0)
    expect(tickOfRow(3, 2, 4)).toBe(3)
  })

  it('never lets my row appear before the first foreign marker', () => {
    // My marker has been on the wheel since the crossfade, so a row in slot four would say
    // "not the best" while the picture still shows a single guess.
    expect(tickOfRow(3, 3, 4)).toBe(0)
    // As rank 0 the best foreign guess is rank 1, so that is when my row may land.
    expect(tickOfRow(0, 0, 4)).toBe(1)
  })

  it('has nothing to give away when I guessed alone', () => {
    expect(tickOfRow(0, 0, 1)).toBe(0)
  })

  it('leaves every row alone when none of them is mine', () => {
    expect(tickOfRow(0, null, 3)).toBe(0)
    expect(tickOfRow(2, null, 3)).toBe(2)
  })
})
