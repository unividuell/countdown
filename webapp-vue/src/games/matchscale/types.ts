/**
 * Augenmessung's wire shapes. Narrowed from `unknown`, like every game's: a stale round of another
 * game may be junk, and a non-finite number would end up as `NaN` in a transform.
 */

/** `path` is an SVG path in normalised units: the bbox's longest side is 1000, y down. */
export interface Silhouette {
  name: string
  path: string
  width: number
  height: number
  attribution: string | null
}

export interface MatchScalePayload {
  categoryName: string
  a: Silhouette
  b: Silhouette
  /** Factor of the gate (`1.1` = ±10 % in the log), or `null` in phase two. */
  toleranceFactor: number | null
}

export interface MatchScaleSolution {
  factor: number
  toleranceFactor: number | null
}

export interface MatchScaleOutcome {
  scale: number
  deviation: number
  withinTolerance: boolean | null
}

export function asMatchScalePayload(value: unknown): MatchScalePayload | null {
  const raw = record(value)
  if (raw === null) return null

  const a = asSilhouette(raw.a)
  const b = asSilhouette(raw.b)
  if (typeof raw.categoryName !== 'string' || a === null || b === null) return null
  if (raw.toleranceFactor !== null && !positive(raw.toleranceFactor)) return null

  return { categoryName: raw.categoryName, a, b, toleranceFactor: raw.toleranceFactor }
}

export function asMatchScaleSolution(value: unknown): MatchScaleSolution | null {
  const raw = record(value)
  if (raw === null || !positive(raw.factor)) return null
  if (raw.toleranceFactor !== null && !positive(raw.toleranceFactor)) return null

  return { factor: raw.factor, toleranceFactor: raw.toleranceFactor }
}

export function asMatchScaleOutcome(value: unknown): MatchScaleOutcome | null {
  const raw = record(value)
  if (raw === null || !positive(raw.scale) || !finite(raw.deviation)) return null
  if (raw.withinTolerance !== null && typeof raw.withinTolerance !== 'boolean') return null

  return { scale: raw.scale, deviation: raw.deviation, withinTolerance: raw.withinTolerance }
}

/** The tipped size factor, or `null` for anything that is not a positive number. */
export function scaleOf(guess: unknown): number | null {
  const scale = record(guess)?.scale

  return positive(scale) ? scale : null
}

function asSilhouette(value: unknown): Silhouette | null {
  const raw = record(value)
  if (raw === null) return null

  const { name, path, width, height, attribution } = raw
  if (typeof name !== 'string' || typeof path !== 'string' || path === '') return null
  if (!positive(width) || !positive(height)) return null
  if (attribution !== null && typeof attribution !== 'string') return null

  return { name, path, width, height, attribution }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0
}
