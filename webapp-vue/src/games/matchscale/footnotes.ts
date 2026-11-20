import type { Silhouette } from './types'

export interface Footnotes {
  /** The marker each name carries; `null` without a credit. */
  markers: { a: string | null; b: string | null }
  notes: { marker: string; text: string }[]
}

/**
 * Numbers the credits of A and B:
 *
 *   same credit      → Alpha¹  Beta¹   ¹ Silhouette: …
 *   different        → Alpha¹  Beta²   ¹ … ² …
 *   missing          → no marker, no note
 *
 * Board and reveal derive it from the same silhouettes, so the numbering never changes between them.
 */
export function footnotesOf(a: Silhouette, b: Silhouette): Footnotes {
  const notes: Footnotes['notes'] = []
  const markers: Footnotes['markers'] = { a: null, b: null }

  for (const key of ['a', 'b'] as const) {
    const text = (key === 'a' ? a : b).attribution
    if (text === null) continue

    const known = notes.find((note) => note.text === text)
    if (known !== undefined) {
      markers[key] = known.marker
      continue
    }

    const marker = notes.length === 0 ? '¹' : '²'
    notes.push({ marker, text })
    markers[key] = marker
  }

  return { markers, notes }
}
