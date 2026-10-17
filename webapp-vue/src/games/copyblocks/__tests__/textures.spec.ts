import { describe, expect, it } from 'vitest'
import { pickaxePixels } from '@/games/copyblocks/textures'

describe('pickaxePixels', () => {
  const grid = pickaxePixels()

  it('is a 16 × 16 sprite', () => {
    expect(grid).toHaveLength(16)
    for (const row of grid) expect(row).toHaveLength(16)
  })

  it('is a diamond head on a wooden handle, outlined dark', () => {
    expect(new Set(grid.flat().filter((c) => c !== null))).toEqual(
      new Set(['#33c3b2', '#a6f1e6', '#b07a3e', '#6b4423', '#1c1c1c']),
    )
  })

  it('runs the handle from the bottom left, the head across the top right', () => {
    expect(grid[15]![0]).toBe('#b07a3e')
    expect(grid[12]![3]).toBe('#b07a3e')
    expect(grid[6]![8]).toBe('#33c3b2')
    expect(grid[5]![9]).toBe('#a6f1e6')
    expect(grid[0]![15]).toBeNull()
    expect(grid[15]![15]).toBeNull()
  })
})
