import type { Measure, Silhouette } from './types'

export interface Footnotes {
  /** The marker(s) each name carries, `1,2`; `null` without a note. Set in `<sup>`. */
  markers: { a: string | null; b: string | null }
  notes: { marker: string; text: string }[]
}

/**
 * Numbers the notes of A and B: credits first, then the category's legend (both names, one
 * number), then — reveal only — the concrete thing behind a generic name:
 *
 *   same credit      → Alpha¹  Beta¹   ¹ Silhouette: …
 *   different        → Alpha¹  Beta²   ¹ … ² …
 *   missing          → no marker, no note
 *   legend           → Alpha¹  Beta¹   ¹ Flächentreue Projektion …
 *   subject          → Alpha¹  Beta    ¹ Maß: Alpha Mk II
 *
 * Board and reveal derive credits and legend alike and the subjects come after them, so a marker
 * the board showed never changes in the reveal.
 */
export function footnotesOf(
  a: Silhouette,
  b: Silhouette,
  {
    legend = null,
    measureA = null,
    measureB = null,
  }: { legend?: string | null; measureA?: Measure | null; measureB?: Measure | null } = {},
): Footnotes {
  const notes: Footnotes['notes'] = []
  const marks: Record<'a' | 'b', string[]> = { a: [], b: [] }

  const note = (key: 'a' | 'b', text: string) => {
    const known = notes.find((n) => n.text === text)
    // Plain digits, raised by `<sup>`: there is no superscript comma to join `¹` and `²`.
    const marker = known?.marker ?? String(notes.length + 1)
    if (known === undefined) notes.push({ marker, text })
    marks[key].push(marker)
  }

  for (const key of ['a', 'b'] as const) {
    const text = (key === 'a' ? a : b).attribution
    if (text !== null) note(key, text)
  }

  if (legend !== null) {
    note('a', legend)
    note('b', legend)
  }

  for (const key of ['a', 'b'] as const) {
    const subject = (key === 'a' ? measureA : measureB)?.subject
    if (subject !== undefined) note(key, `Maß: ${subject}`)
  }

  const joined = (list: string[]) => (list.length === 0 ? null : list.join(','))

  return { markers: { a: joined(marks.a), b: joined(marks.b) }, notes }
}
