import type { Measure, MeasureKind } from './types'
import { formatLength, inUnit, type Unit } from './units'

const AXIS: Record<Measure['axis'], string> = { length: 'Länge', height: 'Höhe' }

const KIND: Record<MeasureKind, string> = {
  'head-body': 'Kopf-Rumpf',
  'total-length': 'Länge',
  shoulder: 'Schulterhöhe',
  'total-height': 'Höhe',
}

/**
 * A measure as the legend reads it, in the round's unit: „200 cm Kopf-Rumpf“, „45 cm Höhe“; a
 * measure without kind names its axis.
 */
export function formatMeasure({ axis, kind, metres }: Measure, unit: Unit): string {
  return `${formatLength(inUnit(metres, unit))} ${unit} ${kind ? KIND[kind] : AXIS[axis]}`
}
