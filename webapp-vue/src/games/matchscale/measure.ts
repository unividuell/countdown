import type { Measure, MeasureKind } from './types'
import { formatTenths, inUnitTenths, type Unit } from './units'

const AXIS: Record<Measure['axis'], string> = { length: 'Länge', height: 'Höhe' }

const KIND: Record<MeasureKind, string> = {
  'head-body': 'Kopf-Rumpf',
  'total-length': 'Länge',
  shoulder: 'Schulterhöhe',
  'total-height': 'Höhe',
  diameter: 'Durchmesser',
}

/**
 * A measure as the legend reads it, in the round's unit and the table's tenths: „200,0 cm
 * Kopf-Rumpf“, „43,6 cm Durchmesser“ — the same number as the table's „Lösung“. A measure without
 * kind names its axis.
 */
export function formatMeasure({ axis, kind, metres }: Measure, unit: Unit): string {
  return `${formatTenths(inUnitTenths(metres, unit))} ${unit} ${kind ? KIND[kind] : AXIS[axis]}`
}
