import { bitmap, glyphCols } from './font'

export const PITCH = 4
export const RADIUS = 1.5
export const DOT_ON = '#fafaf9'
export const DOT_OFF = '#292524'
export const FLIP_MS = 170
export const STAGGER_MS = 9
// Chosen: long enough to register as "off" before the board slams on, short enough to read as the
// first beat of switching on rather than as a loading state.
export const BOOT_DARK_MS = 100
// Chosen: long enough that the all-white board reads as a deliberate switch-on rather than a paint
// glitch, short enough not to withhold the first real reading.
export const BOOT_HOLD_MS = 300
export const BOOT_RESOLVE_AT_MS = BOOT_DARK_MS + BOOT_HOLD_MS

/**
 * Centre of each run of digits, as a percentage of the board's width — where the label for that
 * group belongs. Derived from the metrics rather than written down, so it follows a change to
 * SEPARATOR_COLS and a group that grows a digit.
 *
 * It lives here and not in font.ts because it needs PITCH and RADIUS: where a label sits is a
 * question about the rendered geometry, not about the glyph pattern.
 */
export function groupCentres(text: string): number[] {
  const width = bitmap(text).cols * PITCH - (PITCH - 2 * RADIUS)
  const centres: number[] = []
  let col = 0
  let start: number | null = null

  // The empty sentinel closes a group that runs to the end of the text.
  for (const ch of [...text, '']) {
    const isDigit = ch >= '0' && ch <= '9'
    if (isDigit && start === null) start = col
    if (!isDigit && start !== null) {
      // col has already advanced past the group's trailing gap, so its last column is col - 2.
      const last = col - 2
      centres.push(((start * PITCH + last * PITCH + 2 * RADIUS) / 2 / width) * 100)
      start = null
    }
    if (ch !== '') col += glyphCols(ch) + 1
  }

  return centres
}
