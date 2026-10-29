/**
 * Peilung's wire shapes, narrowed by hand. `payload`, `solution`, `outcome`, every stored guess
 * and every step input arrive as `unknown` by contract, and a stale round may be junk —
 * narrowing here is what keeps `NaN` and an unknown sound out of the field.
 */

/** A position in cell units, `[0, grid]` on both axes; y grows downwards, like `row`. */
export interface Point {
  x: number
  y: number
}

/** One cell of the grid, counted from the top-left. */
export interface Cell {
  col: number
  row: number
}

const NOISE_KINDS = ['BIRDS', 'BROOK', 'COW', 'WIND', 'RAIN'] as const

export type NoiseKind = (typeof NOISE_KINDS)[number]

export type Sound = 'CLIP' | NoiseKind

export interface EchoLocatePayload {
  /** Cells per side. */
  grid: number
  /** Cells a wave travels before it dies out. */
  reach: number
  /** Cells per second. */
  speed: number
  pings: number
  /** How many sayings hide in the field — and how many pins to set. */
  clips: 1 | 2
  bedDb: number
  noiseDb: number
  /** Cells around a target that still count, or `null` in phase two — there is no gate there. */
  toleranceCells: number | null
}

/** One source a ping reaches. `clip` is the clip's place for `CLIP`, otherwise `null`. */
export interface EchoHit {
  sound: Sound
  clip: number | null
  /** Time until the wave arrives there; the answer lists hits by it. */
  delayMs: number
}

export interface EchoLocateSolution {
  targets: Cell[]
  noises: { cell: Cell; kind: NoiseKind }[]
  toleranceCells: number | null
}

export interface EchoLocateOutcome {
  /** In cells; the mean over the clips. */
  distance: number
  /** `null` in phase two. */
  withinTolerance: boolean | null
  /** `pinOf[i]` is the pin the server assigned to target `i`. */
  pinOf: number[]
}

/** `rings[ping]` holds the radii the player marked around that ping, in cells. */
export interface EchoLocateGuess {
  pins: Point[]
  rings: number[][]
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

function isNullOrWhole(value: unknown): value is number | null {
  return value === null || (isWhole(value) && value >= 0)
}

function isNoiseKind(value: unknown): value is NoiseKind {
  return NOISE_KINDS.some((kind) => kind === value)
}

function isInRange(value: unknown, max: number): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= max
}

function hasExactly(record: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(record)

  return keys.length === fields.length && fields.every((field) => keys.includes(field))
}

export function asEchoLocatePayload(raw: unknown): EchoLocatePayload | null {
  if (!isRecord(raw)) return null
  const { grid, reach, speed, pings, clips, bedDb, noiseDb, toleranceCells } = raw
  if (!isWhole(grid) || grid < 1 || !isWhole(pings) || pings < 0) return null
  if (!isFiniteNumber(reach) || reach <= 0 || !isFiniteNumber(speed) || speed <= 0) return null
  if (clips !== 1 && clips !== 2) return null
  if (!isFiniteNumber(bedDb) || !isFiniteNumber(noiseDb) || !isNullOrWhole(toleranceCells)) {
    return null
  }

  return { grid, reach, speed, pings, clips, bedDb, noiseDb, toleranceCells }
}

function asHit(raw: unknown): EchoHit | null {
  if (!isRecord(raw)) return null
  const { sound, clip, delayMs } = raw
  if (sound !== 'CLIP' && !isNoiseKind(sound)) return null
  if (!isWhole(delayMs) || delayMs < 0) return null

  // A clip names its place in the round's clips; a noise names none.
  if (sound === 'CLIP') return isWhole(clip) && clip >= 0 ? { sound, clip, delayMs } : null

  return clip === null ? { sound, clip, delayMs } : null
}

/** The hits of one ping's answer, in the server's order; one bad hit drops the answer. */
export function asEcho(raw: unknown): EchoHit[] | null {
  if (!isRecord(raw) || !Array.isArray(raw['hits'])) return null

  const hits: EchoHit[] = []
  for (const node of raw['hits']) {
    const hit = asHit(node)
    if (hit === null) return null

    hits.push(hit)
  }

  return hits
}

function asPoint(raw: unknown, grid: number): Point | null {
  if (!isRecord(raw) || !hasExactly(raw, ['x', 'y'])) return null
  const { x, y } = raw
  if (!isInRange(x, grid) || !isInRange(y, grid)) return null

  return { x, y }
}

/** A ping's input, read as the server reads it: `{ x, y }` and nothing else, inside the field. */
export const asPing = asPoint

function asCell(raw: unknown): Cell | null {
  if (!isRecord(raw)) return null
  const { col, row } = raw
  if (!isWhole(col) || col < 0 || !isWhole(row) || row < 0) return null

  return { col, row }
}

export function asEchoLocateSolution(raw: unknown): EchoLocateSolution | null {
  if (!isRecord(raw)) return null
  const { targets, noises, toleranceCells } = raw
  if (!isNullOrWhole(toleranceCells)) return null
  if (!Array.isArray(targets) || targets.length === 0 || !Array.isArray(noises)) return null

  const cells: Cell[] = []
  for (const node of targets) {
    const cell = asCell(node)
    if (cell === null) return null

    cells.push(cell)
  }

  const sources: EchoLocateSolution['noises'] = []
  for (const node of noises) {
    if (!isRecord(node)) return null
    const cell = asCell(node['cell'])
    const kind = node['kind']
    if (cell === null || !isNoiseKind(kind)) return null

    sources.push({ cell, kind })
  }

  return { targets: cells, noises: sources, toleranceCells }
}

/** `clips` is the round's: `pinOf` names one pin per clip, so a stray index is no outcome. */
export function asEchoLocateOutcome(raw: unknown, clips: number): EchoLocateOutcome | null {
  if (!isRecord(raw)) return null
  const { distance, withinTolerance, pinOf } = raw
  if (!isFiniteNumber(distance)) return null
  if (withinTolerance !== null && typeof withinTolerance !== 'boolean') return null
  if (!Array.isArray(pinOf) || pinOf.length !== clips) return null
  if (!pinOf.every((pin) => isWhole(pin) && pin >= 0 && pin < clips)) return null

  return { distance, withinTolerance, pinOf: [...pinOf] }
}

/**
 * The pins of a guess. `complete` is the server's rule — exactly one per clip; without it, fewer
 * are fine, as in a draft that is half-placed. The size is checked before any value is read.
 */
export function pinsOf(
  raw: unknown,
  payload: Pick<EchoLocatePayload, 'grid' | 'clips'>,
  options: { complete: boolean },
): Point[] | null {
  if (!Array.isArray(raw)) return null
  if (options.complete ? raw.length !== payload.clips : raw.length > payload.clips) return null

  const pins: Point[] = []
  for (const node of raw) {
    const pin = asPoint(node, payload.grid)
    if (pin === null) return null

    pins.push(pin)
  }

  return pins
}

/**
 * Radii by ping. A ring may reach past the wave — a tap in the afterglow — so up to twice the
 * field. A ring without a ping is not checked: the server does not either.
 */
export function ringsOf(
  raw: unknown,
  payload: Pick<EchoLocatePayload, 'grid' | 'pings' | 'clips'>,
): number[][] | null {
  if (!Array.isArray(raw) || raw.length > payload.pings) return null

  const rings: number[][] = []
  for (const list of raw) {
    if (!Array.isArray(list) || list.length > payload.clips) return null
    if (!list.every((radius) => isInRange(radius, 2 * payload.grid))) return null

    rings.push([...list])
  }

  return rings
}

/** A guess as the server judges it: `{ pins, rings }` and nothing else, pins one per clip. */
export function asEchoLocateGuess(
  raw: unknown,
  payload: EchoLocatePayload,
): EchoLocateGuess | null {
  if (!isRecord(raw) || !hasExactly(raw, ['pins', 'rings'])) return null

  const pins = pinsOf(raw['pins'], payload, { complete: true })
  const rings = ringsOf(raw['rings'], payload)

  return pins === null || rings === null ? null : { pins, rings }
}
