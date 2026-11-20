/**
 * The reveal's lengths: one unit per round, every value a whole number in it. The unit is the
 * largest in which the smaller of A and B still counts ten — countries in km, buildings in m — but
 * never below cm unless something is smaller than a centimetre: a mouse is „8 cm“, not „80 mm“.
 */
import type { Measure } from './types'

export type Unit = 'mm' | 'cm' | 'm' | 'km'

const PER_METRE: Record<Unit, number> = { km: 0.001, m: 1, cm: 100, mm: 1000 }

/** Largest first: the first one in which the smaller value counts ten wins. */
const COARSE_FIRST: readonly Unit[] = ['km', 'm']

/** The round's unit from whichever measures it has; `null` without any. */
export function roundUnit(...measures: readonly (Measure | null)[]): Unit | null {
  const metres = measures.flatMap((measure) => (measure === null ? [] : [measure.metres]))
  if (metres.length === 0) return null

  const smaller = Math.min(...metres)

  return (
    COARSE_FIRST.find((unit) => smaller * PER_METRE[unit] >= 10) ??
    (smaller * PER_METRE.cm >= 1 ? 'cm' : 'mm')
  )
}

/** `2.004` m in `cm` → `200`. */
export function inUnit(metres: number, unit: Unit): number {
  return Math.round(metres * PER_METRE[unit])
}

/** German grouping only from five digits: `2500`, `12.500`. */
const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0, useGrouping: 'min2' })

/** A whole number, a negative one with U+2212: `−40`. `-0` reads `0`. */
export function formatLength(value: number): string {
  return value < 0 ? `−${nf.format(-value)}` : nf.format(Math.abs(value))
}

/** A difference, always signed: `+50`, `−40`, `±0`. */
export function formatSigned(value: number): string {
  if (value === 0) return '±0'

  return value > 0 ? `+${nf.format(value)}` : formatLength(value)
}
