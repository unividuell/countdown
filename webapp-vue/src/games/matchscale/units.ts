/**
 * The reveal's lengths: one unit per round, every value in tenths of it. The unit is the
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

/**
 * The table's precision: tenths, so a tip just outside the gate shows it — `−11,0` against
 * `±10,9`, where whole numbers read `−11` against `±11`. `0.4358` m in `cm` → `43.6`.
 */
export function inUnitTenths(metres: number, unit: Unit): number {
  return Math.round(metres * PER_METRE[unit] * 10) / 10
}

const nf1 = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: 'min2',
})

/** Tenths, a negative with U+2212: `43,6`, `−11,0`. */
export function formatTenths(value: number): string {
  return value < 0 ? `−${nf1.format(-value)}` : nf1.format(Math.abs(value))
}

/** A difference in tenths, always signed: `+0,4`, `−11,0`, `±0,0`. */
export function formatSignedTenths(value: number): string {
  const tenths = Math.round(value * 10) / 10
  if (tenths === 0) return '±0,0'

  return tenths > 0 ? `+${nf1.format(tenths)}` : formatTenths(tenths)
}
