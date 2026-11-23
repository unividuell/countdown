import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CELL_STAGGER_MS,
  FADE_MS,
  HEAD_DELAY_MS,
  headDelayMs,
  isStill,
  othersDelayMs,
  rowStagger,
  ROW_STAGGER_MS,
  tickOfRow,
  SOLUTION_DELAY_MS,
  TYPE_BUDGET_MS,
} from '@/games/revealChoreography'

describe('the reveal schedule', () => {
  it('walks the others top to bottom from their beat, each row left to right', () => {
    expect(othersDelayMs(1, 0, 3)).toBe(0)
    expect(othersDelayMs(1, 3, 3)).toBe(3 * CELL_STAGGER_MS)
    expect(othersDelayMs(3, 0, 4)).toBe(2 * ROW_STAGGER_MS)
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

  it('finishes the head before the story starts', () => {
    // Three head rows, four columns; the last one must have faded in before the solution.
    expect(HEAD_DELAY_MS + headDelayMs(2, 3) + FADE_MS).toBeLessThan(SOLUTION_DELAY_MS)
  })
})

describe('tickOfRow', () => {
  // The verdict is the signal for my points: my row lands with it, alone, and nobody else's row
  // or marker knock sounds into it.
  it('gives my row the first tick, whatever its rank', () => {
    expect(tickOfRow(3, 3)).toBe(0)
    expect(tickOfRow(0, 0)).toBe(0)
  })

  it('lets the others follow in rank order', () => {
    expect([0, 1, 3].map((rank) => tickOfRow(rank, 2))).toEqual([1, 2, 3])
  })

  it('leaves the first tick empty when no row is mine', () => {
    expect(tickOfRow(0, null)).toBe(1)
    expect(tickOfRow(2, null)).toBe(3)
  })
})

describe('isStill', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('runs the beats of a live reveal in a foreground tab', () => {
    expect(isStill(true)).toBe(false)
  })

  it('just is there on a reload', () => {
    expect(isStill(false)).toBe(true)
  })

  it('just is there under reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)

    expect(isStill(true)).toBe(true)
  })

  it('just is there in a background tab', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

    expect(isStill(true)).toBe(true)
  })

  it('just is there without animation frames', () => {
    vi.stubGlobal('requestAnimationFrame', undefined)

    expect(isStill(true)).toBe(true)
  })
})
