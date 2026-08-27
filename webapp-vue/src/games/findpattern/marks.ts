/**
 * What sits on top of the board image, as arithmetic: which cell, which colour, how far in.
 *
 * Pure for the same reason `selection.ts` is — happy-dom computes no layout, so an inset expressed in
 * pixels is testable while the same inset expressed as a rendered box is not.
 */

export interface OutlineSource {
  userId: string
  startIndex: number
  colorHex: string
  /** When this outline fades in — from the shared reveal choreography, never invented here. */
  delayMs: number
}

export interface CellOutline {
  index: number
  colorHex: string
  insetPx: number
  delayMs: number
}

/** How far each collision moves an outline inwards. The original's `collisionsAtIndex * 2`. */
export const OUTLINE_STEP_PX = 2

/**
 * Every source's run as outlines, insetting whatever collides with what is already there.
 *
 * The order of [sources] decides who sits outside: the caller puts the viewer's own tip first, so it
 * keeps the box it had while they were playing. The original stacked in database order, which meant
 * your own tip moved after the round.
 */
export function stackedOutlines(
  sources: readonly OutlineSource[],
  patternLength: number,
  stepPx: number = OUTLINE_STEP_PX,
): CellOutline[] {
  const taken = new Map<number, number>()
  const marks: CellOutline[] = []
  for (const source of sources) {
    for (let step = 0; step < patternLength; step++) {
      const index = source.startIndex + step
      const collisions = taken.get(index) ?? 0
      marks.push({
        index,
        colorHex: source.colorHex,
        insetPx: collisions * stepPx,
        delayMs: source.delayMs,
      })
      taken.set(index, collisions + 1)
    }
  }
  return marks
}

/**
 * Whether a cell shows its tone index. A possibility starts lit, everything else starts dark, and a
 * tap flips whichever it is — one rule, so „die Möglichkeiten“ needs no second form language beside
 * the outline and the number.
 */
export function isNumberVisible(
  index: number,
  preLit: ReadonlySet<number>,
  toggled: ReadonlySet<number>,
): boolean {
  return preLit.has(index) !== toggled.has(index)
}
