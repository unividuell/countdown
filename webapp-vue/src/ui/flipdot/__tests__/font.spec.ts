import { describe, expect, it } from 'vitest'
import {
  GLYPH_COLS,
  GLYPH_ROWS,
  SEPARATOR_COLS,
  bitmap,
  glyphCols,
  padded,
  type Bitmap,
} from '@/ui/flipdot/font'

const lit = (on: readonly boolean[]) => on.filter(Boolean).length
const litCell = (b: Bitmap, row: number, col: number) => b.on[row * b.cols + col] ?? false

const PAD = { top: 2, right: 5, bottom: 2, left: 1 }

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

  // Replaces the old `8 * 6 - 1`: the separator is no longer as wide as a digit.
  it('grows the column count with the glyph widths, not with the character count', () => {
    // 6 digits at 5 columns + 2 separators at 3 + 7 single-column gaps.
    expect(bitmap('12:34:56').cols).toBe(6 * GLYPH_COLS + 2 * SEPARATOR_COLS + 7)
    expect(bitmap('12:34:56').cols).toBe(43)
  })

  it('gives the separator its own width', () => {
    expect(glyphCols(':')).toBe(SEPARATOR_COLS)
    expect(glyphCols('7')).toBe(GLYPH_COLS)
    expect(bitmap(':').cols).toBe(SEPARATOR_COLS)
  })

  it('keeps the separator lit in its middle column', () => {
    const b = bitmap(':')
    expect(lit(b.on)).toBe(2)
    expect(b.on[2 * b.cols + 1]).toBe(true)
    expect(b.on[4 * b.cols + 1]).toBe(true)
    expect(b.on[2 * b.cols + 0]).toBe(false)
    expect(b.on[2 * b.cols + 2]).toBe(false)
  })

  it('places the glyph after a separator by the separator width, not the digit width', () => {
    // '1' + gap + ':' + gap = 5 + 1 + 3 + 1 = 10, so the second digit starts at column 10.
    const b = bitmap('1:1')
    expect(b.cols).toBe(15)
    expect(b.on[0 * b.cols + 12]).toBe(true) // top dot of the trailing '1'
    for (let r = 0; r < b.rows; r++) {
      expect(b.on[r * b.cols + 9]).toBe(false) // the gap before it stays empty
    }
  })
})

describe('padded', () => {
  it('grows the field by exactly the cells it is given', () => {
    const bm = padded(bitmap('1'), PAD)

    expect(bm.cols).toBe(GLYPH_COLS + PAD.left + PAD.right)
    expect(bm.rows).toBe(GLYPH_ROWS + PAD.top + PAD.bottom)
    expect(bm.on).toHaveLength(bm.cols * bm.rows)
  })

  it('moves the glyph into the field rather than clipping it', () => {
    const bare = bitmap('1')
    const bm = padded(bare, PAD)

    for (let r = 0; r < bare.rows; r++) {
      for (let c = 0; c < bare.cols; c++) {
        expect(litCell(bm, r + PAD.top, c + PAD.left)).toBe(litCell(bare, r, c))
      }
    }
  })

  // The padding is field, not glyph: a lit dot out there would read as a stray mark on the band.
  it('leaves every added cell dark', () => {
    const bm = padded(bitmap('12:34'), PAD)
    const rowLit = (r: number) => bm.on.slice(r * bm.cols, (r + 1) * bm.cols).some(Boolean)
    const colLit = (c: number) => bm.on.filter((_, i) => i % bm.cols === c).some(Boolean)

    expect(rowLit(0)).toBe(false)
    expect(rowLit(bm.rows - 1)).toBe(false)
    expect(colLit(0)).toBe(false)
    expect(colLit(bm.cols - 1)).toBe(false)
  })

  it('is the identity for no padding at all', () => {
    const bare = bitmap('12:34')

    expect(padded(bare, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual(bare)
  })
})
