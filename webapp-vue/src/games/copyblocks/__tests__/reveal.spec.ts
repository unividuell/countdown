import { describe, expect, it } from 'vitest'
import { toGuess } from '@/games/copyblocks/fit'
import type { Fit } from '@/games/copyblocks/fit'
import { revealView } from '@/games/copyblocks/reveal'
import type { CopyBlocksOutcome, GuessBlock } from '@/games/copyblocks/types'

const TEMPLATE: GuessBlock[] = [
  { x: 0, y: 0, z: 0, type: 'DIRT' },
  { x: 1, y: 0, z: 0, type: 'BRICKS' },
  { x: 0, y: 1, z: 0, type: 'LEAVES' },
]
const FIT: Fit = { turns: 1, dx: 4, dy: 0, dz: 2 }

/** A template-space block as the player with [fit] sees it. */
function seen(fit: Fit, b: GuessBlock): GuessBlock {
  const [x, y, z] = toGuess(fit, [b.x, b.y, b.z])
  return { x, y, z, type: b.type }
}

function outcome(over: Partial<CopyBlocksOutcome>): CopyBlocksOutcome {
  return { correct: false, fit: FIT, missing: [], extra: [], wrongType: [], ...over }
}

describe('revealView', () => {
  it('without a selection shows the template as it stands', () => {
    expect(revealView({ template: TEMPLATE, ownFit: null, shown: null })).toEqual({
      blocks: TEMPLATE,
      marks: [],
    })
  })

  it('shows a hit as the template in my own coordinates, unmarked', () => {
    expect(
      revealView({ template: TEMPLATE, ownFit: FIT, shown: outcome({ correct: true }) }),
    ).toEqual({ blocks: TEMPLATE.map((b) => seen(FIT, b)), marks: [] })
  })

  it('rebuilds the shown tip from its deviations and marks them', () => {
    const wrong: GuessBlock = { x: 1, y: 0, z: 0, type: 'STONE' }
    const extra: GuessBlock = { x: 2, y: 0, z: 0, type: 'DIRT' }
    const view = revealView({
      template: TEMPLATE,
      ownFit: FIT,
      shown: outcome({ missing: [TEMPLATE[2]!], extra: [extra], wrongType: [wrong] }),
    })

    expect(view.blocks).toEqual([seen(FIT, TEMPLATE[0]!), seen(FIT, wrong), seen(FIT, extra)])
    expect(view.marks).toEqual([
      { ...seen(FIT, TEMPLATE[2]!), kind: 'missing' },
      { ...seen(FIT, extra), kind: 'extra' },
      { ...seen(FIT, wrong), kind: 'wrongType' },
    ])
  })

  it("draws someone else's tip with my own fit, so my view does not turn", () => {
    const theirs = outcome({ fit: { turns: 3, dx: -5, dy: 0, dz: 0 }, missing: [TEMPLATE[0]!] })

    expect(revealView({ template: TEMPLATE, ownFit: FIT, shown: theirs }).blocks).toEqual(
      [TEMPLATE[1]!, TEMPLATE[2]!].map((b) => seen(FIT, b)),
    )
  })
})
