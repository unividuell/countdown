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

  const cells = (match: (c: string) => boolean) =>
    grid.flatMap((row, y) => row.flatMap((c, x) => (c !== null && match(c) ? [{ x, y }] : [])))
  const mean = (list: { x: number; y: number }[]) => ({
    x: list.reduce((sum, c) => sum + c.x, 0) / list.length,
    y: list.reduce((sum, c) => sum + c.y, 0) / list.length,
  })

  it('runs the handle up from the bottom left, the head across the top right', () => {
    const wood = mean(cells((c) => c === '#b07a3e' || c === '#6b4423'))
    const head = mean(cells((c) => c === '#33c3b2' || c === '#a6f1e6'))

    expect(wood.x).toBeLessThan(head.x)
    expect(wood.y).toBeGreaterThan(head.y)
  })

  it('sits centred in its square', () => {
    const drawn = cells(() => true)
    const xs = drawn.map((c) => c.x)
    const ys = drawn.map((c) => c.y)
    const [left, right] = [Math.min(...xs), 15 - Math.max(...xs)]
    const [top, bottom] = [Math.min(...ys), 15 - Math.max(...ys)]

    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1)
  })
})
