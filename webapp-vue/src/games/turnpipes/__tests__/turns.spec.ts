import { describe, expect, it } from 'vitest'
import { rotationOf, rotationsOf, turnTo } from '@/games/turnpipes/turns'

describe('rotationOf', () => {
  it('folds quarter turns into 0..3', () => {
    expect(rotationOf(5)).toBe(1)
    expect(rotationOf(-1)).toBe(3)
    expect(rotationOf(0)).toBe(0)
  })
})

describe('turnTo', () => {
  it('only turns forward', () => {
    expect(turnTo(5, 0, 'ELBOW')).toBe(8)
    expect(turnTo(5, 1, 'ELBOW')).toBe(5)
  })

  it('treats a straight pipe as the same after a half turn', () => {
    expect(turnTo(5, 3, 'STRAIGHT')).toBe(5)
    expect(turnTo(6, 0, 'STRAIGHT')).toBe(6)
  })

  it("takes the nearer of a straight pipe's two ways", () => {
    expect(turnTo(4, 3, 'STRAIGHT')).toBe(5)
  })

  it('turns an inlet and an outlet the whole way round', () => {
    expect(turnTo(1, 0, 'INLET')).toBe(4)
    expect(turnTo(1, 0, 'OUTLET')).toBe(4)
  })
})

describe('rotationsOf', () => {
  it('folds every cell', () => {
    expect(rotationsOf([4, 7])).toEqual([0, 3])
  })
})
