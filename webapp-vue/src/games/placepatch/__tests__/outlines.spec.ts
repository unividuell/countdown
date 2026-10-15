import { describe, expect, it } from 'vitest'
import { stackedOutlines } from '@/games/placepatch/outlines'

describe('stackedOutlines', () => {
  it('puts the first source outside and insets every collision on the same cell', () => {
    const outlines = stackedOutlines([
      { userId: 'mine', cell: { x: 7, y: 4 }, colorHex: '#7c3aed', delayMs: 0 },
      { userId: 'fry', cell: { x: 7, y: 4 }, colorHex: '#16a34a', delayMs: 500 },
      { userId: 'amy', cell: { x: 3, y: 4 }, colorHex: '#dc2626', delayMs: 600 },
    ])

    expect(outlines.map((o) => [o.userId, o.insetPx])).toEqual([
      ['mine', 0],
      ['fry', 2],
      ['amy', 0],
    ])
    expect(outlines[1]?.delayMs).toBe(500)
  })
})
