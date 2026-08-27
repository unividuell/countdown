/**
 * The tap's selection rules, as index arithmetic.
 *
 * Pure and separate from the board because happy-dom computes no layout: a rule expressed in cell
 * indices is testable, the same rule expressed in pointer coordinates is not.
 *
 * There is no partial deselect and no hole: whoever taps somewhere else starts over. On a phone that
 * is the forgiving direction — a mis-tap costs a fresh start, never a wrong guess.
 */

export function nextSelection(
  current: readonly number[],
  tapped: number,
  patternLength: number,
): number[] {
  // A full selection has already been submitted; the next tap opens a new attempt.
  const base = current.length >= patternLength ? [] : current
  if (base.includes(tapped)) return []
  if (base.includes(tapped - 1) || base.includes(tapped + 1)) return [...base, tapped]
  return [tapped]
}

export function isComplete(selection: readonly number[], patternLength: number): boolean {
  return selection.length === patternLength
}

/**
 * The index the guess is submitted under: the lowest of a complete, gapless run, or `null`.
 *
 * The gap check cannot fail under [nextSelection] — every added cell touches one already there — and
 * is kept because this is the value that leaves for the server. A hole would be a guess about four
 * cells the player never picked.
 */
export function startIndexOfSelection(
  selection: readonly number[],
  patternLength: number,
): number | null {
  if (!isComplete(selection, patternLength)) return null
  const ordered = [...selection].sort((a, b) => a - b)
  for (let step = 1; step < ordered.length; step++) {
    if (ordered[step] !== ordered[step - 1]! + 1) return null
  }
  return ordered[0]!
}
