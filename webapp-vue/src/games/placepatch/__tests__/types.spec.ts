import { describe, expect, it } from 'vitest'
import {
  asPlacePatchPayload,
  asPlacePatchScene,
  asPlacePatchSolution,
  cellOf,
} from '@/games/placepatch/types'

const LAYOUT = { cols: 40, rows: 30, size: 10 }

describe('placepatch types', () => {
  it('takes a payload of three whole numbers with the patch inside the board', () => {
    expect(asPlacePatchPayload(LAYOUT)).toEqual(LAYOUT)
    expect(asPlacePatchPayload({ cols: 40, rows: 30 })).toBeNull()
    expect(asPlacePatchPayload({ cols: 40, rows: 30, size: 41 })).toBeNull()
    expect(asPlacePatchPayload({ cols: 40.5, rows: 30, size: 10 })).toBeNull()
    expect(asPlacePatchPayload(null)).toBeNull()
  })

  it('takes a scene of two whole numbers', () => {
    expect(asPlacePatchScene({ cols: 40, rows: 53 })).toEqual({ cols: 40, rows: 53 })
    expect(asPlacePatchScene({ cols: 40, rows: Number.NaN })).toBeNull()
  })

  it('takes a solution only where a patch fits', () => {
    expect(asPlacePatchSolution({ x: 7, y: 4 }, LAYOUT)).toEqual({ x: 7, y: 4 })
    expect(asPlacePatchSolution({ x: 31, y: 4 }, LAYOUT)).toBeNull()
    expect(asPlacePatchSolution({ x: 7, y: 4 }, null)).toBeNull()
  })

  it('reads a guess as a cell on the board, and nothing else', () => {
    expect(cellOf({ x: 0, y: 20 }, LAYOUT)).toEqual({ x: 0, y: 20 })
    expect(cellOf({ x: 99, y: 3 }, LAYOUT)).toBeNull()
    expect(cellOf({ x: -1, y: 3 }, LAYOUT)).toBeNull()
    expect(cellOf({ x: 1.5, y: 3 }, LAYOUT)).toBeNull()
    expect(cellOf({ x: Number.NaN, y: 3 }, LAYOUT)).toBeNull()
    expect(cellOf(null, LAYOUT)).toBeNull()
    expect(cellOf({ x: 1, y: 3 }, null)).toBeNull()
  })
})
