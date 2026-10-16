import { describe, expect, it } from 'vitest'
import {
  asCopyBlocksGuess,
  asCopyBlocksOutcome,
  asCopyBlocksPayload,
} from '@/games/copyblocks/types'

const DIRT = { x: 0, y: 0, z: 0, type: 'DIRT' }

describe('asCopyBlocksPayload', () => {
  it('keeps a well-formed payload', () => {
    const payload = { grid: 6, types: ['DIRT', 'BRICKS', 'LEAVES'], blocks: [DIRT] }

    expect(asCopyBlocksPayload(payload)).toEqual(payload)
  })

  it('drops an unknown code and a broken block rather than painting them white', () => {
    expect(
      asCopyBlocksPayload({
        grid: 6,
        types: ['DIRT', 'GLASS'],
        blocks: [
          DIRT,
          { x: 1, y: 0, z: 0, type: 'GLASS' },
          { x: Number.NaN, y: 0, z: 0, type: 'DIRT' },
          { x: 1.5, y: 0, z: 0, type: 'DIRT' },
        ],
      }),
    ).toEqual({ grid: 6, types: ['DIRT'], blocks: [DIRT] })
  })

  it('is null without a grid, a type or a block', () => {
    for (const junk of [
      null,
      'x',
      {},
      { grid: 0, types: ['DIRT'], blocks: [DIRT] },
      { grid: 6, types: [], blocks: [DIRT] },
      { grid: 6, types: ['DIRT'], blocks: [] },
    ]) {
      expect(asCopyBlocksPayload(junk)).toBeNull()
    }
  })
})

describe('asCopyBlocksOutcome', () => {
  const OUTCOME = {
    correct: false,
    fit: { turns: 1, dx: 3, dy: 0, dz: -2 },
    missing: [{ x: 0, y: 0, z: 1, type: 'LAPIS' }],
    extra: [],
    wrongType: [{ x: 2, y: 0, z: 0, type: 'STONE' }],
  }

  it('keeps a well-formed outcome', () => {
    expect(asCopyBlocksOutcome(OUTCOME)).toEqual(OUTCOME)
  })

  it('drops junk blocks from the lists', () => {
    expect(asCopyBlocksOutcome({ ...OUTCOME, missing: [{ x: 'a' }, null] })?.missing).toEqual([])
  })

  it('is null for a fit that is no quarter turn or not whole', () => {
    for (const fit of [
      { turns: 4, dx: 0, dy: 0, dz: 0 },
      { turns: 1, dx: 0.5, dy: 0, dz: 0 },
      null,
    ]) {
      expect(asCopyBlocksOutcome({ ...OUTCOME, fit })).toBeNull()
    }
    expect(asCopyBlocksOutcome({ ...OUTCOME, correct: 'yes' })).toBeNull()
  })
})

describe('asCopyBlocksGuess', () => {
  it('keeps the blocks and drops what is not one', () => {
    expect(asCopyBlocksGuess({ blocks: [DIRT, { x: 1 }] })).toEqual({ blocks: [DIRT] })
    expect(asCopyBlocksGuess({ blocks: [] })).toBeNull()
    expect(asCopyBlocksGuess(null)).toBeNull()
  })
})
