import { describe, expect, it } from 'vitest'
import { bitmap, GLYPH_COLS, GLYPH_ROWS, padded, type Bitmap } from '@/ui/flipdot/font'

const PAD = { top: 2, right: 5, bottom: 2, left: 1 }
const lit = (b: Bitmap, row: number, col: number) => b.on[row * b.cols + col] ?? false

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
        expect(lit(bm, r + PAD.top, c + PAD.left)).toBe(lit(bare, r, c))
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
