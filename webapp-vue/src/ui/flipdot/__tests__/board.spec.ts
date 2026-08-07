import { describe, expect, it } from 'vitest'
import { groupCentres } from '@/ui/flipdot/board'

describe('groupCentres', () => {
  it('has no centre without digits', () => {
    expect(groupCentres('')).toEqual([])
    expect(groupCentres(':')).toEqual([])
  })

  it('centres a board that is one group', () => {
    expect(groupCentres('58')[0]).toBeCloseTo(50, 10)
    expect(groupCentres('58')).toHaveLength(1)
  })

  it('returns one centre per group, left to right', () => {
    const centres = groupCentres('13:42:07')
    expect(centres).toHaveLength(3)
    expect(centres[0]!).toBeLessThan(centres[1]!)
    expect(centres[1]!).toBeLessThan(centres[2]!)
  })

  // Symmetry pins the arithmetic without reimplementing it: for a text whose groups are all the
  // same width, the middle group must sit dead centre and the outer two must mirror each other.
  it('is symmetric for a symmetric readout', () => {
    const [first, middle, last] = groupCentres('13:42:07')
    expect(middle!).toBeCloseTo(50, 10)
    expect(first!).toBeCloseTo(100 - last!, 10)
  })

  // Derived by hand so a wrong formula cannot hide behind a coincidentally symmetric result:
  // the first group spans columns 0-10, so its centre sits at (0 * 4 + 10 * 4 + 2 * 1.5) / 2 = 21.5
  // of a board that is 43 * 4 - 1 = 171 units wide.
  it('puts the first group of HH:MM:SS at 12.57%', () => {
    expect(groupCentres('13:42:07')[0]!).toBeCloseTo(12.573, 3)
  })

  it('follows a group that grows a digit', () => {
    // A three-digit leading group pushes everything right of it further right.
    const two = groupCentres('99:04:33:12')
    const three = groupCentres('999:04:33:12')
    expect(three[1]!).toBeGreaterThan(two[1]!)
    expect(three).toHaveLength(4)
  })
})
