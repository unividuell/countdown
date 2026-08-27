import { describe, expect, it } from 'vitest'
import { isNumberVisible, stackedOutlines } from '@/games/findpattern/marks'

const LENGTH = 4

describe('stackedOutlines', () => {
  it('draws four cells per source, from its start index', () => {
    const marks = stackedOutlines(
      [{ userId: 'a', startIndex: 10, colorHex: '#f00', delayMs: 0 }],
      LENGTH,
    )

    expect(marks.map((mark) => mark.index)).toEqual([10, 11, 12, 13])
    expect(marks.every((mark) => mark.insetPx === 0)).toBe(true)
  })

  /** The first source stays outermost — the caller puts mine first, so mine sits where it sat. */
  it('insets a later source once per cell already taken', () => {
    const marks = stackedOutlines(
      [
        { userId: 'mine', startIndex: 10, colorHex: '#f00', delayMs: 0 },
        { userId: 'other', startIndex: 12, colorHex: '#0f0', delayMs: 500 },
      ],
      LENGTH,
    )

    const other = marks.filter((mark) => mark.colorHex === '#0f0')
    expect(other.map((mark) => [mark.index, mark.insetPx])).toEqual([
      [12, 2],
      [13, 2],
      [14, 0],
      [15, 0],
    ])
  })

  it("carries every one of a source's cells on its own delay", () => {
    const marks = stackedOutlines(
      [{ userId: 'a', startIndex: 0, colorHex: '#f00', delayMs: 1900 }],
      LENGTH,
    )

    expect(marks.every((mark) => mark.delayMs === 1900)).toBe(true)
  })
})

describe('isNumberVisible', () => {
  const preLit = new Set([4, 5, 6, 7])

  it('shows a possibility without being asked', () => {
    expect(isNumberVisible(4, preLit, new Set())).toBe(true)
  })

  it('hides a possibility that was tapped', () => {
    expect(isNumberVisible(4, preLit, new Set([4]))).toBe(false)
  })

  it('shows an ordinary cell that was tapped', () => {
    expect(isNumberVisible(40, preLit, new Set([40]))).toBe(true)
  })

  it('hides an ordinary cell nobody touched', () => {
    expect(isNumberVisible(40, preLit, new Set())).toBe(false)
  })
})
