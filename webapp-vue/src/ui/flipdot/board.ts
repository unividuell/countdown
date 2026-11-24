import { bitmap, glyphCols, type Pad } from './font'

export const PITCH = 4
export const RADIUS = 1.5
export const DOT_ON = '#fafaf9'
export const DOT_OFF = '#292524'

/**
 * board-phase-two — the reading of a play that is being timed. Only the reading changes colour;
 * the field stays as it is, so the board reads as the same instrument in a different mode rather
 * than as a warning lamp in the corner of the band.
 *
 * Twin in CSS: `--color-board-phase-two` in `src/assets/main.css`. A hex here and a token there,
 * because the dots get their colour via `setAttribute` and in WAAPI keyframes — no class helps
 * there. Whoever changes the colour changes it in both places.
 *
 * `#f4a8ff` is what `--color-fuchsia-300` (`oklch(83.3% 0.145 321.434)`) rasterises to, read out
 * of the browser's colour engine. Re-derive it the same way if the palette ever moves.
 */
export const DOT_ALARM_ON = '#f4a8ff'

export type Tone = 'default' | 'alarm'

export const TONES: Record<Tone, { on: string; off: string }> = {
  default: { on: DOT_ON, off: DOT_OFF },
  alarm: { on: DOT_ALARM_ON, off: DOT_OFF },
}

/**
 * What the dots stand on. `board`: the dark instrument of the game band, the same in both schemes.
 * `surface`: straight on the page (the header countdown), so they follow the scheme. `inverse`:
 * the countdown card, `inverse-surface` — the dark board on the light page, a light one on the
 * dark page.
 */
export type Ground = 'board' | 'surface' | 'inverse'

/**
 * Dots on a light ground — the light page, or the inverse card in the dark: on in on-surface
 * (`#0d0d0d`), off barely off surface (`#f7f5f1`): a hint of the grid, not a grey field. On the
 * dark page (stone-700) the board's own colours already read, so there is no dark twin. Only the
 * plain tone: nothing on a light ground is timed yet.
 */
export const SURFACE_LIGHT = { on: '#0d0d0d', off: '#f0ede8' }

/**
 * The game band's field: two blank rows above and below so the dots meet the band's edges, and
 * five blank columns on each side. The five on the right are the card's own 16px gutter — not the
 * 12px corner radius they also clear — so the digits keep standing where they stand while the
 * field runs into the corner. The five on the left are not needed for anything except symmetry,
 * and symmetry is the whole point: the readout sits centred in its field rather than pressed
 * against one end of it.
 */
export const BAND_PAD: Pad = { top: 2, right: 5, bottom: 2, left: 5 }

/** The header countdown's field: one free dot round the digits, so they do not touch its edge. */
export const HEADER_PAD: Pad = { top: 1, right: 1, bottom: 1, left: 1 }

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
 * How far ahead of its turn a column's animations are created. Creating all of a board's at the
 * moment of the reveal is what stalled the main thread: the header board changes ~70% of its dots
 * there, and one `Element.animate` per changed dot in a single frame measured as a 75 ms frame at
 * 4x CPU throttling — long enough to be seen, and it lands on the frame the member swarm is flying
 * in on. Spreading creation over the frames the wave runs in brought the worst frame to 25 ms.
 *
 * Three frames of slack at 60 Hz: enough that a late frame still cannot make a column start after
 * its turn, and enough that an ordinary per-second flip — whose whole wave is shorter than this —
 * is still created in one go, exactly as before.
 */
export const CREATE_LEAD_MS = 48

/**
 * Centre of each run of digits, as a percentage of the board's width — where the label for that
 * group belongs. Derived from the metrics rather than written down, so it follows a change to
 * SEPARATOR_COLS and a group that grows a digit.
 *
 * It lives here and not in font.ts because it needs PITCH and RADIUS: where a label sits is a
 * question about the rendered geometry, not about the glyph pattern.
 *
 * A padded board passes its `pad`: the field is wider and the digits start `pad.left` columns in.
 */
export function groupCentres(text: string, pad?: Pad): number[] {
  const cols = bitmap(text).cols + (pad?.left ?? 0) + (pad?.right ?? 0)
  const width = cols * PITCH - (PITCH - 2 * RADIUS)
  const centres: number[] = []
  let col = pad?.left ?? 0
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
