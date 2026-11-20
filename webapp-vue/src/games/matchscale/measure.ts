import type { Measure, MeasureKind } from './types'

const AXIS: Record<Measure['axis'], string> = { length: 'Länge', height: 'Höhe' }

const KIND: Record<MeasureKind, string> = {
  'head-body': 'Kopf-Rumpf',
  'total-length': 'Länge',
  shoulder: 'Schulterhöhe',
  'total-height': 'Höhe',
}

/**
 * A measure as the legend reads it: „2,3 m Länge“, „1,05 m Kopf-Rumpf“, „45 cm Höhe“; a measure without kind names its axis. Below a metre in whole
 * centimetres, below one centimetre with one decimal („0,4 cm“) rather than „0 cm“.
 */
export function formatMeasure({ axis, kind, metres }: Measure): string {
  const cm = metres * 100
  const size =
    Math.round(cm) < 100
      ? `${cm.toLocaleString('de-DE', { maximumFractionDigits: cm < 1 ? 1 : 0 })} cm`
      : `${metres.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m`

  return `${size} ${kind ? KIND[kind] : AXIS[axis]}`
}
