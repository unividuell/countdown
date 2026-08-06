export const GLYPH_COLS = 5
export const GLYPH_ROWS = 7

// The separator carries a single lit column. Four empty ones around it would only cost width —
// and width is the scarce dimension in the header, where the whole readout must fit next to
// nothing at all on a 360px phone.
export const SEPARATOR_COLS = 3

const BLANK = '00000,00000,00000,00000,00000,00000,00000'

const GLYPHS: Record<string, string> = {
  ' ': BLANK,
  ':': '00000,00000,00100,00000,00100,00000,00000',
  '0': '01110,10001,10001,10001,10001,10001,01110',
  '1': '00100,01100,00100,00100,00100,00100,01110',
  '2': '01110,10001,00001,00010,00100,01000,11111',
  '3': '11111,00010,00100,00010,00001,10001,01110',
  '4': '00010,00110,01010,10010,11111,00010,00010',
  '5': '11111,10000,11110,00001,00001,10001,01110',
  '6': '00110,01000,10000,11110,10001,10001,01110',
  '7': '11111,00001,00010,00100,01000,01000,01000',
  '8': '01110,10001,10001,01110,10001,10001,01110',
  '9': '01110,10001,10001,01111,00001,00010,01100',
}

/** Columns a glyph occupies. Digits keep the full cell; the separator is a centred slice of it. */
export function glyphCols(ch: string): number {
  return ch === ':' ? SEPARATOR_COLS : GLYPH_COLS
}

function patternOf(ch: string): string[] {
  const rows = (GLYPHS[ch] ?? BLANK).split(',')
  if (glyphCols(ch) === GLYPH_COLS) return rows
  const offset = Math.floor((GLYPH_COLS - SEPARATOR_COLS) / 2)
  return rows.map((row) => row.slice(offset, offset + SEPARATOR_COLS))
}

export interface Bitmap {
  cols: number
  rows: number
  on: boolean[]
}

export function bitmap(text: string): Bitmap {
  const chars = [...text]
  const cols =
    chars.length === 0 ? 0 : chars.reduce((sum, ch) => sum + glyphCols(ch), 0) + chars.length - 1
  const on = new Array<boolean>(cols * GLYPH_ROWS).fill(false)

  let x = 0
  for (const ch of chars) {
    const width = glyphCols(ch)
    const rows = patternOf(ch)
    for (let r = 0; r < GLYPH_ROWS; r++) {
      const row = rows[r] ?? ''
      for (let c = 0; c < width; c++) {
        if (row[c] === '1') on[r * cols + x + c] = true
      }
    }
    x += width + 1
  }

  return { cols, rows: GLYPH_ROWS, on }
}
