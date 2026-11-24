/**
 * Anrührung's wire shapes. Narrowed from `unknown`: a stale round of another game may be junk.
 */

export interface MixColorPigment {
  key: string
  name: string
  hex: string
}

export interface MixColorPayload {
  targetHex: string
  /** Drops the glass holds. */
  capacity: number
  pigments: MixColorPigment[]
}

/** Drops per pigment key. */
export type Recipe = Record<string, number>

export interface MixColorSolution {
  recipe: Recipe
  /** Largest deviation that still counts, or `null` in phase two. */
  tolerance: number | null
}

export interface MixColorOutcome {
  hex: string
  recipe: Recipe
  deviation: number
  withinTolerance: boolean | null
}

const HEX = /^#[0-9A-Fa-f]{6}$/

export function asMixColorPayload(value: unknown): MixColorPayload | null {
  const raw = record(value)
  if (raw === null || !hex(raw.targetHex)) return null
  if (!count(raw.capacity) || raw.capacity < 1) return null
  if (!Array.isArray(raw.pigments)) return null

  const pigments: MixColorPigment[] = []
  for (const item of raw.pigments) {
    const pigment = asPigment(item)
    if (pigment === null) return null
    pigments.push(pigment)
  }

  return { targetHex: raw.targetHex, capacity: raw.capacity, pigments }
}

export function asMixColorSolution(value: unknown): MixColorSolution | null {
  const raw = record(value)
  if (raw === null) return null

  const recipe = asRecipe(raw.recipe)
  if (recipe === null) return null
  if (raw.tolerance !== null && !finite(raw.tolerance)) return null

  return { recipe, tolerance: raw.tolerance }
}

export function asMixColorOutcome(value: unknown): MixColorOutcome | null {
  const raw = record(value)
  if (raw === null || !hex(raw.hex) || !finite(raw.deviation)) return null
  if (raw.withinTolerance !== null && typeof raw.withinTolerance !== 'boolean') return null

  const recipe = asRecipe(raw.recipe)
  if (recipe === null) return null

  return { hex: raw.hex, recipe, deviation: raw.deviation, withinTolerance: raw.withinTolerance }
}

/** A step answer's glass colour, or `null` for junk. */
export function glassOf(answer: unknown): string | null {
  const value = record(answer)?.hex

  return hex(value) ? value : null
}

/** The guessed drop count, or `null` for anything but a non-negative integer. */
export function dropsOf(guess: unknown): number | null {
  const drops = record(guess)?.drops

  return count(drops) ? drops : null
}

function asPigment(value: unknown): MixColorPigment | null {
  const raw = record(value)
  if (raw === null) return null

  const { key, name } = raw
  if (typeof key !== 'string' || typeof name !== 'string' || !hex(raw.hex)) return null

  return { key, name, hex: raw.hex }
}

function asRecipe(value: unknown): Recipe | null {
  const raw = record(value)
  if (raw === null) return null

  const entries = Object.entries(raw)
  if (!entries.every(([, drops]) => count(drops))) return null

  return raw as Recipe
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function count(value: unknown): value is number {
  return finite(value) && Number.isInteger(value) && value >= 0
}

function hex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}
