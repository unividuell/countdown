/**
 * Augenmaß's wire shapes. Narrowed from `unknown`, like every game's: a stale round of another
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

/** What was measured; the reveal names it. Each kind belongs to one axis. */
export type MeasureKind = 'head-body' | 'total-length' | 'shoulder' | 'total-height' | 'diameter'

const MEASURE_KINDS: readonly unknown[] = [
  'head-body',
  'total-length',
  'shoulder',
  'total-height',
  'diameter',
]

/** The real size behind a silhouette: its `axis` is `metres` long, per `source`. Solution only. */
export interface Measure {
  axis: 'length' | 'height'
  /** Absent where the dataset does not say; the reveal then names just the axis. */
  kind?: MeasureKind
  metres: number
  source: string
  /** The concrete thing behind a generic name („Alpha“ → „Alpha Mk II“); absent where the name is it. */
  subject?: string
}

export interface MatchScaleSolution {
  factor: number
  toleranceFactor: number | null
  /** `null` where the dataset has no measure, or it arrived as junk. */
  a: Measure | null
  b: Measure | null
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

  return {
    factor: raw.factor,
    toleranceFactor: raw.toleranceFactor,
    a: asMeasure(raw.a),
    b: asMeasure(raw.b),
  }
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

/** A junk measure costs only its line in the legend, not the round. */
function asMeasure(value: unknown): Measure | null {
  const raw = record(value)
  if (raw === null) return null

  const { axis, kind, metres, source, subject } = raw
  if (axis !== 'length' && axis !== 'height') return null
  if (!positive(metres) || typeof source !== 'string') return null

  // A kind the client does not know costs only the precise wording, a junk subject only its line.
  return {
    axis,
    ...(MEASURE_KINDS.includes(kind) ? { kind: kind as MeasureKind } : {}),
    metres,
    source,
    ...(typeof subject === 'string' && subject.trim() !== '' ? { subject } : {}),
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function positive(value: unknown): value is number {
  return finite(value) && value > 0
}
