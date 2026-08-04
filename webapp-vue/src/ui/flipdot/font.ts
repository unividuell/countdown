export const GLYPH_COLS = 5
export const GLYPH_ROWS = 7

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

export interface Bitmap {
  cols: number
  rows: number
  on: boolean[]
}

export function bitmap(text: string): Bitmap {
  const cols = text.length === 0 ? 0 : text.length * (GLYPH_COLS + 1) - 1
  const on = new Array<boolean>(cols * GLYPH_ROWS).fill(false)

  for (let i = 0; i < text.length; i++) {
    const rows = (GLYPHS[text[i] ?? ' '] ?? BLANK).split(',')
    for (let r = 0; r < GLYPH_ROWS; r++) {
      const row = rows[r] ?? ''
      for (let c = 0; c < GLYPH_COLS; c++) {
        if (row[c] === '1') on[r * cols + i * (GLYPH_COLS + 1) + c] = true
      }
    }
  }

  return { cols, rows: GLYPH_ROWS, on }
}
