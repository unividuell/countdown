import { describe, expect, it } from 'vitest'
import {
  asFindPatternSolution,
  isFindPatternPayload,
  startIndexOf,
} from '@/games/findpattern/types'

const PAYLOAD = {
  cols: 8,
  rows: 14,
  patternLength: 4,
  boardImage: 'data:image/png;base64,AAA',
  patternImage: 'data:image/png;base64,BBB',
}

const SOLUTION = {
  blocks: Array.from({ length: 112 }, (_, i) => i % 4),
  pattern: [0, 1, 2, 3],
  palette: ['#ffffff', '#cccccc', '#999999', '#666666'],
  delta: 0.14,
  startIndices: [0, 4, 8],
}

describe('isFindPatternPayload', () => {
  it('accepts the server shape', () => {
    expect(isFindPatternPayload(PAYLOAD)).toBe(true)
  })

  it('rejects anything missing or mistyped', () => {
    expect(isFindPatternPayload(null)).toBe(false)
    expect(isFindPatternPayload({ ...PAYLOAD, cols: '8' })).toBe(false)
    expect(isFindPatternPayload({ ...PAYLOAD, boardImage: undefined })).toBe(false)
  })
})

describe('asFindPatternSolution', () => {
  it('narrows the server shape', () => {
    expect(asFindPatternSolution(SOLUTION)).toEqual(SOLUTION)
  })

  it('is null for junk rather than letting NaN reach the screen', () => {
    expect(asFindPatternSolution(null)).toBeNull()
    expect(asFindPatternSolution({ ...SOLUTION, palette: ['#fff'] })).toBeNull()
    expect(asFindPatternSolution({ ...SOLUTION, delta: 'wide' })).toBeNull()
    expect(asFindPatternSolution({ ...SOLUTION, blocks: [1, 'x', 3] })).toBeNull()
  })
})

describe('startIndexOf', () => {
  it('reads a stored guess', () => {
    expect(startIndexOf({ startIndex: 42 })).toBe(42)
  })

  it('is null for a give-up row or junk', () => {
    expect(startIndexOf(null)).toBeNull()
    expect(startIndexOf({})).toBeNull()
    expect(startIndexOf({ startIndex: Number.NaN })).toBeNull()
    expect(startIndexOf({ startIndex: '3' })).toBeNull()
  })
})
