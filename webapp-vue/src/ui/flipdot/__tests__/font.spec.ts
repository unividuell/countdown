import { describe, expect, it } from 'vitest'
import { GLYPH_COLS, GLYPH_ROWS, bitmap } from '@/ui/flipdot/font'

const lit = (on: readonly boolean[]) => on.filter(Boolean).length

describe('flipdot font', () => {
  it('is empty for the empty string', () => {
    const b = bitmap('')
    expect(b.cols).toBe(0)
    expect(b.on).toEqual([])
  })

  it('sizes a single glyph to the 5x7 cell', () => {
    const b = bitmap('1')
    expect(b.cols).toBe(GLYPH_COLS)
    expect(b.rows).toBe(GLYPH_ROWS)
    expect(b.on.length).toBe(GLYPH_COLS * GLYPH_ROWS)
  })

  it('lights the expected dots of the digit 1', () => {
    const b = bitmap('1')
    expect(b.on[0 * b.cols + 2]).toBe(true)
    expect(b.on[1 * b.cols + 1]).toBe(true)
    expect(b.on[1 * b.cols + 2]).toBe(true)
    expect(b.on[0 * b.cols + 0]).toBe(false)
    expect(lit(b.on)).toBe(10)
  })

  it('puts exactly one blank column between two glyphs', () => {
    const b = bitmap('00')
    expect(b.cols).toBe(11)
    for (let r = 0; r < b.rows; r++) {
      expect(b.on[r * b.cols + 5]).toBe(false)
    }
  })

  it('places the second glyph six columns to the right', () => {
    const b = bitmap('01')
    expect(b.on[0 * b.cols + 8]).toBe(true)
  })

  it('renders the colon as two dots', () => {
    expect(lit(bitmap(':').on)).toBe(2)
  })

  it('renders an unknown character as an empty cell rather than throwing', () => {
    const b = bitmap('A')
    expect(b.cols).toBe(GLYPH_COLS)
    expect(lit(b.on)).toBe(0)
  })

  it('grows the column count with the character count', () => {
    expect(bitmap('12:34:56').cols).toBe(8 * 6 - 1)
  })
})
