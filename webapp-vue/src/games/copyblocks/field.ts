export type Cell = readonly [number, number, number]

/** The cells a view lays out, both corners inclusive. */
export interface Box {
  lo: Cell
  hi: Cell
}

interface At {
  x: number
  y: number
  z: number
}

/**
 * The build field starts as the grid cube and always reaches one cell past the build — sideways
 * and up; the floor drops to the lowest block. So a build begun near a wall never runs out of room.
 */
export function fieldOf(blocks: readonly At[], grid: number): Box {
  const lo: [number, number, number] = [0, 0, 0]
  const hi: [number, number, number] = [grid - 1, grid - 1, grid - 1]

  for (const { x, y, z } of blocks) {
    lo[0] = Math.min(lo[0], x - 1)
    lo[1] = Math.min(lo[1], y)
    lo[2] = Math.min(lo[2], z - 1)
    hi[0] = Math.max(hi[0], x + 1)
    hi[1] = Math.max(hi[1], y + 1)
    hi[2] = Math.max(hi[2], z + 1)
  }

  return { lo, hi }
}

/**
 * The template stands on a floor one cell wider than its footprint: up is fixed, as in judging.
 * Never empty — the payload narrowing guarantees a block.
 */
export function templateFieldOf(blocks: readonly At[]): Box {
  const min = (k: keyof At): number => Math.min(...blocks.map((b) => b[k]))
  const max = (k: keyof At): number => Math.max(...blocks.map((b) => b[k]))

  return {
    lo: [min('x') - 1, min('y'), min('z') - 1],
    hi: [max('x') + 1, max('y'), max('z') + 1],
  }
}
