import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildTower, place, position } from '@/games/stackfloor/tower'
import type { TowerGeometry } from '@/games/stackfloor/tower'

// The file TowerGoldenVectorTest asserts against: one side cannot drift without the other going red.
const VECTORS_PATH = '../shared/stack-floor/tower.json'

type Pair = [number, number]
const vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as {
  version: number
  geometry: TowerGeometry
  positions: { floor: number; width: number; ms: number; x: number }[]
  places: { below: Pair; x: number; width: number; bar: Pair | null }[]
  towers: { maxFloors: number; clicks: number[]; height: number; missed: boolean; bars: Pair[] }[]
}

describe('tower', () => {
  it('reads version 2 vectors', () => {
    expect(vectors.version).toBe(2)
  })

  it.each(vectors.positions)('puts floor $floor, width $width at $ms ms on $x', (v) => {
    expect(position(vectors.geometry, v.floor, v.width, v.ms)).toBe(v.x)
  })

  it.each(vectors.places)('places x $x, width $width on $below', (v) => {
    const bar = place({ left: v.below[0], width: v.below[1] }, v.x, v.width)

    expect(bar === null ? null : [bar.left, bar.width]).toEqual(v.bar)
  })

  it.each(vectors.towers)('builds a tower from $clicks', (v) => {
    const result = buildTower({ ...vectors.geometry, maxFloors: v.maxFloors }, v.clicks)

    expect(result.bars.map((bar) => [bar.left, bar.width])).toEqual(v.bars)
    expect(result.bars.length - 1).toBe(v.height)
    expect(result.missed).toBe(v.missed)
  })
})
