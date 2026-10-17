import { describe, expect, it } from 'vitest'
import { fieldOf, templateFieldOf } from '@/games/copyblocks/field'

describe('fieldOf', () => {
  it('starts as the grid cube', () => {
    expect(fieldOf([], 6)).toEqual({ lo: [0, 0, 0], hi: [5, 5, 5] })
  })

  it('reaches one past the build, sideways and up', () => {
    expect(fieldOf([{ x: 5, y: 5, z: 5 }], 6)).toEqual({ lo: [0, 0, 0], hi: [6, 6, 6] })
    expect(fieldOf([{ x: 0, y: 0, z: 0 }], 6)).toEqual({ lo: [-1, 0, -1], hi: [5, 5, 5] })
  })

  it('lowers the floor to the lowest block, never below it', () => {
    expect(fieldOf([{ x: 2, y: -2, z: 2 }], 6)).toEqual({ lo: [0, -2, 0], hi: [5, 5, 5] })
  })

  it('shrinks back with the build, never below the grid cube', () => {
    expect(fieldOf([{ x: 2, y: 2, z: 2 }], 6)).toEqual({ lo: [0, 0, 0], hi: [5, 5, 5] })
  })
})

describe('templateFieldOf', () => {
  it('lays a floor one cell wider than the footprint, as tall as the template', () => {
    expect(
      templateFieldOf([
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 3, z: 1 },
      ]),
    ).toEqual({ lo: [-1, 0, -1], hi: [3, 3, 2] })
  })
})
