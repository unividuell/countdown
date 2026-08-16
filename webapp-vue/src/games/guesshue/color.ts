/**
 * Guess Hue's colour arithmetic. Its own module rather than a private helper in `reveal.ts`,
 * because the wheel and the scoreboard both need it: the sector inks itself against the solution
 * colour, and every row of the table inks itself against a different guess colour.
 */
import { wrap360 } from './geometry'

/**
 * The bridge to `readableTextColor`, which parses hex and nothing else. Needed because yellow and
 * blue at the same HSL lightness are nowhere near equally bright, so the decision cannot be made
 * from `lightness` alone.
 */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = wrap360(hue) / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const rgb: [number, number, number] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second]
  const [r, g, b] = rgb
  const base = lightness - chroma / 2
  const channel = (value: number): string =>
    Math.round((value + base) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}
