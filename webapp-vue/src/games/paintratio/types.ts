/**
 * Kreativverhältnis' wire shapes, narrowed by hand. `payload`, `solution`, `outcome` and every
 * stored guess arrive as `unknown` by contract, and a stale round may be junk — narrowing here is
 * what keeps `NaN` and an unknown brush out of the picture.
 */

/** The server's limits for a guess; the board refuses what would be rejected. */
export const COORDINATE_LIMIT = 10_000
export const MAX_POINTS = 100_000
export const MAX_STROKES = 5_000

/** Σ(|dx| + |dy|) over every segment of every stroke. */
export const MAX_PATH = 3_000_000

export interface PaintRatioPayload {
  width: number
  height: number
  /** Diameters in canvas units; a stroke names its brush by index. */
  brushes: number[]
  /** Share of the canvas, or `null` in phase two — there is no gate there, only the closest scores. */
  tolerance: number | null
}

export interface PaintRatioSolution {
  targetRatio: number
  tolerance: number | null
}

export interface PaintRatioOutcome {
  ratio: number
  difference: number
  /** `null` in phase two. */
  withinTolerance: boolean | null
}

/** `points` is flat `[x0, y0, x1, y1, …]` in canvas units. */
export interface Stroke {
  brush: number
  color: string
  points: number[]
}

export interface PaintRatioGuess {
  strokes: Stroke[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isNullOrFinite(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

export function asPaintRatioPayload(raw: unknown): PaintRatioPayload | null {
  if (!isRecord(raw)) return null
  const { width, height, brushes, tolerance } = raw
  if (!isWhole(width) || width < 1 || !isWhole(height) || height < 1) return null
  if (!isNullOrFinite(tolerance)) return null

  // One bad diameter drops the payload: filtering would shift the indices strokes point at.
  if (!Array.isArray(brushes) || brushes.length === 0) return null
  if (!brushes.every((brush) => isWhole(brush) && brush >= 1)) return null

  return { width, height, brushes: [...brushes], tolerance }
}

export function asPaintRatioSolution(raw: unknown): PaintRatioSolution | null {
  if (!isRecord(raw)) return null
  const { targetRatio, tolerance } = raw
  if (!isFiniteNumber(targetRatio) || !isNullOrFinite(tolerance)) return null

  return { targetRatio, tolerance }
}

export function asPaintRatioOutcome(raw: unknown): PaintRatioOutcome | null {
  if (!isRecord(raw)) return null
  const { ratio, difference, withinTolerance } = raw
  if (!isFiniteNumber(ratio) || !isFiniteNumber(difference)) return null
  if (withinTolerance !== null && typeof withinTolerance !== 'boolean') return null

  return { ratio, difference, withinTolerance }
}

/**
 * Lower-cases a `#rrggbb` colour — the server rejects `#3049E8`, and an avatar colour arrives in
 * upper case. `null` for anything that is not six hex digits after a `#`.
 */
export function normalizeColor(raw: string): string | null {
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : null
}

function hasExactly(record: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(record)

  return keys.length === fields.length && fields.every((field) => keys.includes(field))
}

function asStroke(raw: unknown, brushCount: number): Stroke | null {
  if (!isRecord(raw) || !hasExactly(raw, ['brush', 'color', 'points'])) return null
  const { brush, color, points } = raw
  if (!isWhole(brush) || brush < 0 || brush >= brushCount) return null
  if (typeof color !== 'string' || normalizeColor(color) !== color) return null

  // The size is checked before any value is read, as the server does.
  if (!Array.isArray(points) || points.length < 2 || points.length % 2 !== 0) return null
  if (points.length > 2 * MAX_POINTS) return null
  if (!points.every((point) => isWhole(point) && Math.abs(point) <= COORDINATE_LIMIT)) return null

  return { brush, color, points: [...points] }
}

/** Σ(|dx| + |dy|) along one stroke's segments — Manhattan, so exact in integers on both sides. */
export function pathOf(points: readonly number[]): number {
  let path = 0
  for (let i = 0; i + 3 < points.length; i += 2) {
    path += Math.abs(points[i + 2]! - points[i]!) + Math.abs(points[i + 3]! - points[i + 1]!)
  }

  return path
}

/**
 * The strokes of a stored guess, read as strictly as the server reads them: exact field sets,
 * whole numbers, every limit. `null` when anything is off — a draft that no longer fits is
 * dropped, not repaired. An empty list is valid; an empty stroke is not.
 */
export function strokesOf(raw: unknown, brushCount: number): Stroke[] | null {
  if (!isRecord(raw) || !hasExactly(raw, ['strokes'])) return null
  const { strokes: nodes } = raw
  if (!Array.isArray(nodes) || nodes.length > MAX_STROKES) return null

  const strokes: Stroke[] = []
  let points = 0
  let path = 0

  for (const node of nodes) {
    const stroke = asStroke(node, brushCount)
    if (stroke === null) return null

    points += stroke.points.length / 2
    path += pathOf(stroke.points)
    if (points > MAX_POINTS || path > MAX_PATH) return null

    strokes.push(stroke)
  }

  return strokes
}
