/**
 * What the server sends, narrowed by hand. `payload`, `solution` and every stored guess arrive as
 * `unknown` by contract, and a stale round may be junk — narrowing here is what keeps `NaN` out of a
 * style attribute.
 */

export interface FindPatternPayload {
  cols: number
  rows: number
  patternLength: number
  /** `data:image/png;base64,…` — the board. No colour ever reaches the client as a value. */
  boardImage: string
  patternImage: string
}

export interface FindPatternSolution {
  /** One palette index per cell, in reading order. */
  blocks: number[]
  pattern: number[]
  palette: string[]
  delta: number
  /** Every start index that would have counted. */
  startIndices: number[]
}

export interface FindPatternGuessWire {
  startIndex: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** For fields the Kotlin side types as `Int` — `delta` is a genuine `Double` and keeps [isFiniteNumber]. */
function isFiniteInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value)
}

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteInteger)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

export function isFindPatternPayload(value: unknown): value is FindPatternPayload {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<FindPatternPayload>
  return (
    isFiniteInteger(candidate.cols) &&
    isFiniteInteger(candidate.rows) &&
    isFiniteInteger(candidate.patternLength) &&
    typeof candidate.boardImage === 'string' &&
    typeof candidate.patternImage === 'string'
  )
}

export function asFindPatternSolution(value: unknown): FindPatternSolution | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<FindPatternSolution>
  if (!isIntegerArray(candidate.blocks) || candidate.blocks.length === 0) return null
  if (!isIntegerArray(candidate.pattern) || candidate.pattern.length === 0) return null
  if (!isStringArray(candidate.palette)) return null
  if (!isIntegerArray(candidate.startIndices)) return null
  if (!isFiniteNumber(candidate.delta)) return null
  // Every block index has to name a tone, or a cell would render with `undefined` as its colour.
  const tones = candidate.palette.length
  if (tones === 0) return null
  if (candidate.blocks.some((tone) => tone < 0 || tone >= tones)) return null
  if (candidate.pattern.some((tone) => tone < 0 || tone >= tones)) return null
  return {
    blocks: candidate.blocks,
    pattern: candidate.pattern,
    palette: candidate.palette,
    delta: candidate.delta,
    startIndices: candidate.startIndices,
  }
}

/**
 * The viewer's own guess, or `null` — a give-up row has none, and neither has a junk one.
 *
 * An index, not a measurement: every consumer does arithmetic on it (`slice`, cell-index equality),
 * so a fractional value must not narrow any more than a fractional `startIndices` entry would.
 */
export function startIndexOf(guess: unknown): number | null {
  if (typeof guess !== 'object' || guess === null) return null
  const value = (guess as { startIndex?: unknown }).startIndex
  return isFiniteInteger(value) ? value : null
}
