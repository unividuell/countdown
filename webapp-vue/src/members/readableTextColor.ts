const DARK = '#111111'
const LIGHT = '#ffffff'

/**
 * The only derivation left in the frontend — a statement about rendering, not about the domain.
 * Deliberately hand-rolled: chroma-js would be a runtime dependency for twelve lines.
 *
 * `** 2.4` is fine here despite the cross-runtime-parity guideline's ban on `pow`: nothing computes
 * this value a second time on the JVM, so there is no stream to keep bit-identical.
 */
export function readableTextColor(hex: string): string {
  const rgb = parse(hex)
  if (!rgb) return LIGHT
  const [r, g, b] = rgb
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  // 0.179 is where contrast against black and against white is equal.
  return luminance > 0.179 ? DARK : LIGHT
}

function parse(hex: string): [number, number, number] | null {
  const body = hex.trim().replace(/^#/, '')
  const full = body.length === 3 ? [...body].map((c) => c + c).join('') : body
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const value = Number.parseInt(full, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function linear(channel: number): number {
  const s = channel / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
