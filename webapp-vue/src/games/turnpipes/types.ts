/**
 * What the server sends, narrowed by hand. `payload`, `outcome` and every stored guess arrive as
 * `unknown` by contract, and a stale round may be junk — narrowing here keeps an unknown kind and
 * `NaN` out of the picture. Lengths of rotations are the caller's to check against the board.
 */

export type PipeKindCode = 'STRAIGHT' | 'ELBOW' | 'INLET' | 'OUTLET'

export const MIN_SIZE = 6
export const MAX_SIZE = 8

export interface TurnPipesScene {
  size: number
}

export interface TurnPipesPayload {
  size: number
  /** Row-major, `size²` long: `index = y × size + x`. */
  kinds: PipeKindCode[]
  /** Quarter turns clockwise per cell, 0..3, the scrambled starting position. */
  start: number[]
}

export interface TurnPipesSolution {
  rotations: number[]
  path: number[]
}

/** Where the water ran out: into the open (`at` is `null`) or against a cell, coming from `from`. */
export interface Leak {
  at: number | null
  from: number
}

export interface TurnPipesOutcome {
  correct: boolean
  wet: number[]
  leak: Leak | null
}

export interface TurnPipesGuess {
  rotations: number[]
}

const KINDS: readonly string[] = ['STRAIGHT', 'ELBOW', 'INLET', 'OUTLET']

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isCell(value: unknown): value is number {
  return isWhole(value) && value >= 0
}

function isKind(value: unknown): value is PipeKindCode {
  return typeof value === 'string' && KINDS.includes(value)
}

function isSize(value: unknown): value is number {
  return isWhole(value) && value >= MIN_SIZE && value <= MAX_SIZE
}

function asWholes(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.every(isWhole)) return null

  return value
}

function asCells(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.every(isCell)) return null

  return value
}

export function asTurnPipesScene(value: unknown): TurnPipesScene | null {
  if (typeof value !== 'object' || value === null) return null
  const { size } = value as Partial<Record<keyof TurnPipesScene, unknown>>

  return isSize(size) ? { size } : null
}

export function asTurnPipesPayload(value: unknown): TurnPipesPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const { size, kinds, start } = value as Partial<Record<keyof TurnPipesPayload, unknown>>
  if (!isSize(size) || !Array.isArray(kinds) || !Array.isArray(start)) return null

  const cells = size * size
  if (kinds.length !== cells || start.length !== cells) return null
  if (!kinds.every(isKind)) return null
  if (kinds.filter((kind) => kind === 'INLET').length !== 1) return null
  if (kinds.filter((kind) => kind === 'OUTLET').length !== 1) return null
  if (!start.every((turn) => isWhole(turn) && turn >= 0 && turn <= 3)) return null

  return { size, kinds, start }
}

export function asTurnPipesSolution(value: unknown): TurnPipesSolution | null {
  if (typeof value !== 'object' || value === null) return null
  const { rotations, path } = value as Partial<Record<keyof TurnPipesSolution, unknown>>

  const turns = asWholes(rotations)
  const cells = asWholes(path)
  if (turns === null || cells === null) return null

  return { rotations: turns, path: cells }
}

function asLeak(value: unknown): Leak | null | undefined {
  if (value === null) return null
  if (typeof value !== 'object') return undefined

  const { at, from } = value as Partial<Record<keyof Leak, unknown>>
  if (!(at === null || isCell(at)) || !isCell(from)) return undefined

  return { at, from }
}

export function asTurnPipesOutcome(value: unknown): TurnPipesOutcome | null {
  if (typeof value !== 'object' || value === null) return null
  const { correct, wet, leak } = value as Partial<Record<keyof TurnPipesOutcome, unknown>>
  if (typeof correct !== 'boolean') return null

  const cells = asCells(wet)
  const leaked = asLeak(leak)
  if (cells === null || leaked === undefined) return null

  return { correct, wet: cells, leak: leaked }
}

export function asTurnPipesGuess(value: unknown): TurnPipesGuess | null {
  if (typeof value !== 'object' || value === null) return null
  const rotations = asWholes((value as Partial<TurnPipesGuess>).rotations)

  return rotations === null ? null : { rotations }
}
