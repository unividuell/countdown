import { describe, expect, it } from 'vitest'
import { isComplete, nextSelection, startIndexOfSelection } from '@/games/findpattern/selection'

const LENGTH = 4

describe('nextSelection', () => {
  it('starts a selection on the first tap', () => {
    expect(nextSelection([], 17, LENGTH)).toEqual([17])
  })

  it('grows in both directions along the reading order', () => {
    expect(nextSelection([17], 18, LENGTH)).toEqual([17, 18])
    expect(nextSelection([17, 18], 16, LENGTH)).toEqual([17, 18, 16])
  })

  /** Reading like a book means index ± 1 — the row boundary is a display decision, not a wall. */
  it('treats the last cell of a row and the first of the next as neighbours', () => {
    expect(nextSelection([7], 8, LENGTH)).toEqual([7, 8])
  })

  it('clears the selection when a cell already in it is tapped', () => {
    expect(nextSelection([17, 18], 17, LENGTH)).toEqual([])
  })

  it('starts over when a cell that touches nothing is tapped', () => {
    expect(nextSelection([17, 18], 40, LENGTH)).toEqual([40])
  })

  it('starts over once the selection was already full', () => {
    expect(nextSelection([17, 18, 19, 20], 60, LENGTH)).toEqual([60])
    expect(nextSelection([17, 18, 19, 20], 21, LENGTH)).toEqual([21])
  })
})

describe('isComplete', () => {
  it('is true at exactly the pattern length', () => {
    expect(isComplete([1, 2, 3], LENGTH)).toBe(false)
    expect(isComplete([1, 2, 3, 4], LENGTH)).toBe(true)
  })
})

describe('startIndexOfSelection', () => {
  it('is the lowest index of a complete, gapless run', () => {
    expect(startIndexOfSelection([20, 18, 19, 17], LENGTH)).toBe(17)
  })

  it('is null while the selection is short', () => {
    expect(startIndexOfSelection([17, 18], LENGTH)).toBeNull()
  })

  /** Defensive: the rules above cannot produce a hole, and a submitted guess must not risk one. */
  it('is null for a run with a hole', () => {
    expect(startIndexOfSelection([17, 18, 20, 21], LENGTH)).toBeNull()
  })
})
