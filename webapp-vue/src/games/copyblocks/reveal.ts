import { IDENTITY, toGuess } from './fit'
import type { Fit } from './fit'
import type { CopyBlocksOutcome, GuessBlock } from './types'

export type MarkKind = 'missing' | 'extra' | 'wrongType'

/** A block the reveal flags, drawn on top of the picture. */
export type Mark = GuessBlock & { kind: MarkKind }

function cellKey(block: GuessBlock): string {
  return `${block.x},${block.y},${block.z}`
}

/**
 * What the reveal draws: the shown tip, rebuilt in template coordinates from its deviations — the
 * template without what it lacks, retyped where it got the type wrong, plus what it added — and
 * the marks on those deviations. Everything goes through the *viewer's* inverse fit, so picking
 * another name never turns the view. Without a viewer's fit (history, onlookers) it stays in the
 * template's own coordinates; without a selection it is the template, unmarked.
 */
export function revealView(input: {
  template: readonly GuessBlock[]
  ownFit: Fit | null
  shown: CopyBlocksOutcome | null
}): { blocks: GuessBlock[]; marks: Mark[] } {
  const { missing = [], extra = [], wrongType = [] } = input.shown ?? {}
  const fit = input.ownFit ?? IDENTITY

  const seen = ({ x, y, z, type }: GuessBlock): GuessBlock => {
    const [sx, sy, sz] = toGuess(fit, [x, y, z])

    return { x: sx, y: sy, z: sz, type }
  }

  const lacking = new Set(missing.map(cellKey))
  const retyped = new Map(wrongType.map((b) => [cellKey(b), b.type]))

  const tip = [
    ...input.template
      .filter((b) => !lacking.has(cellKey(b)))
      .map((b) => ({ ...b, type: retyped.get(cellKey(b)) ?? b.type })),
    ...extra,
  ]

  return {
    blocks: tip.map(seen),
    marks: [
      ...missing.map((b) => ({ ...seen(b), kind: 'missing' as const })),
      ...extra.map((b) => ({ ...seen(b), kind: 'extra' as const })),
      ...wrongType.map((b) => ({ ...seen(b), kind: 'wrongType' as const })),
    ],
  }
}
