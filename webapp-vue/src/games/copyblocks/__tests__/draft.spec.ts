import { beforeEach, describe, expect, it } from 'vitest'
import { clearDraft, draftKey, loadDraft, saveDraft, sweepDrafts } from '@/games/copyblocks/draft'
import type { CopyBlocksPayload, GuessBlock } from '@/games/copyblocks/types'

const PAYLOAD: CopyBlocksPayload = {
  grid: 6,
  types: ['DIRT', 'BRICKS', 'LEAVES'],
  blocks: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
}
const BUILD: GuessBlock[] = [{ x: 1, y: 0, z: 2, type: 'BRICKS' }]
const KEY = draftKey({ userId: 'u1', payload: PAYLOAD, timed: false })
const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 16, 12)
const OLD = NOW - 49 * HOUR
const FRESH = NOW - 47 * HOUR

function otherRound(cell: number, timed = false): string {
  const payload = { ...PAYLOAD, blocks: [{ x: cell, y: 0, z: 0, type: 'DIRT' as const }] }

  return draftKey({ userId: 'u1', payload, timed })
}

describe('draft', () => {
  beforeEach(() => localStorage.clear())

  it('is keyed by player, round and phase', () => {
    expect(KEY.startsWith('copy-blocks:draft:u1:')).toBe(true)
    expect(draftKey({ userId: 'u1', payload: PAYLOAD, timed: false })).toBe(KEY)
    expect(draftKey({ userId: 'u2', payload: PAYLOAD, timed: false })).not.toBe(KEY)
    expect(draftKey({ userId: 'u1', payload: PAYLOAD, timed: true })).not.toBe(KEY)
    const other = { ...PAYLOAD, blocks: [{ x: 1, y: 0, z: 0, type: 'DIRT' as const }] }
    expect(draftKey({ userId: 'u1', payload: other, timed: false })).not.toBe(KEY)
  })

  it('names the phase and fingerprints the round as eight hex digits', () => {
    expect(KEY).toMatch(/^copy-blocks:draft:u1:1:[0-9a-f]{8}$/)
    expect(draftKey({ userId: 'u1', payload: PAYLOAD, timed: true })).toMatch(
      /^copy-blocks:draft:u1:2:[0-9a-f]{8}$/,
    )
  })

  it('gives back what it saved, and nothing once cleared', () => {
    saveDraft(localStorage, KEY, BUILD)
    expect(loadDraft(localStorage, KEY, PAYLOAD.types)).toEqual(BUILD)

    clearDraft(localStorage, KEY)
    expect(loadDraft(localStorage, KEY, PAYLOAD.types)).toBeNull()
  })

  it('stores the compact wire form, stamped with the save time', () => {
    saveDraft(localStorage, KEY, BUILD, 1234)

    expect(localStorage.getItem(KEY)).toBe('{"v":1,"at":1234,"blocks":[[1,0,2,"BRICKS"]]}')
  })

  it('loads a draft that carries no save time', () => {
    localStorage.setItem(KEY, '{"v":1,"blocks":[[1,0,2,"BRICKS"]]}')

    expect(loadDraft(localStorage, KEY, PAYLOAD.types)).toEqual(BUILD)
  })

  it("sweeps the same player's old drafts of other rounds, and nobody else's", () => {
    const old = draftKey({ userId: 'u1', payload: PAYLOAD, timed: true })
    const theirs = draftKey({ userId: 'u2', payload: PAYLOAD, timed: false })
    saveDraft(localStorage, KEY, BUILD, NOW)
    saveDraft(localStorage, old, BUILD, OLD)
    saveDraft(localStorage, theirs, BUILD, OLD)
    localStorage.setItem('infobox:copy-blocks', 'true')

    sweepDrafts(localStorage, KEY, NOW)

    expect(localStorage.getItem(KEY)).not.toBeNull()
    expect(localStorage.getItem(old)).toBeNull()
    expect(localStorage.getItem(theirs)).not.toBeNull()
    expect(localStorage.getItem('infobox:copy-blocks')).toBe('true')
  })

  it("spares a fresh draft of the same player's other round, and drops every stale one", () => {
    const fresh = otherRound(1)
    const old = otherRound(2)
    const timeless = otherRound(3)
    const garbled = otherRound(4)
    const unreadable = otherRound(5)
    saveDraft(localStorage, KEY, BUILD, NOW)
    saveDraft(localStorage, fresh, BUILD, FRESH)
    saveDraft(localStorage, old, BUILD, OLD)
    localStorage.setItem(timeless, '{"v":1,"blocks":[[1,0,2,"BRICKS"]]}')
    localStorage.setItem(garbled, '{"v":1,"at":"soon","blocks":[]}')
    localStorage.setItem(unreadable, '{')

    sweepDrafts(localStorage, KEY, NOW)

    expect(localStorage.getItem(KEY)).not.toBeNull()
    expect(localStorage.getItem(fresh)).not.toBeNull()
    for (const key of [old, timeless, garbled, unreadable]) {
      expect(localStorage.getItem(key)).toBeNull()
    }
  })

  it('sweeps nothing for a key that is not one of its own', () => {
    const old = draftKey({ userId: 'u1', payload: PAYLOAD, timed: true })
    saveDraft(localStorage, old, BUILD, OLD)

    expect(() => sweepDrafts(localStorage, 'k', NOW)).not.toThrow()

    expect(localStorage.getItem(old)).not.toBeNull()
  })

  it('discards what it cannot read, rather than repairing it', () => {
    // 201 distinct cells, all within reach: only the count is wrong.
    const crowded = Array.from({ length: 201 }, (_, i) => [
      i % 7,
      Math.floor(i / 7) % 8,
      Math.floor(i / 56),
      'DIRT',
    ])
    for (const raw of [
      '{',
      '"x"',
      JSON.stringify({ v: 2, blocks: [] }),
      JSON.stringify({ v: 1, blocks: [[0, 0, 0, 'STONE']] }),
      JSON.stringify({ v: 1, blocks: [[0.5, 0, 0, 'DIRT']] }),
      JSON.stringify({ v: 1, blocks: [[65, 0, 0, 'DIRT']] }),
      JSON.stringify({ v: 1, blocks: crowded }),
      JSON.stringify({
        v: 1,
        blocks: [
          [0, 0, 0, 'DIRT'],
          [0, 0, 0, 'DIRT'],
        ],
      }),
    ]) {
      localStorage.setItem(KEY, raw)
      expect(loadDraft(localStorage, KEY, PAYLOAD.types)).toBeNull()
      expect(localStorage.getItem(KEY)).toBeNull()
    }
  })

  it('plays on without a storage that works', () => {
    const denied = () => {
      throw new Error('denied')
    }
    const broken = {
      getItem: denied,
      setItem: denied,
      removeItem: denied,
      key: denied,
      clear: denied,
      get length(): number {
        return denied()
      },
    } as unknown as Storage

    expect(() => saveDraft(broken, KEY, BUILD)).not.toThrow()
    expect(() => sweepDrafts(broken, KEY)).not.toThrow()
    expect(() => clearDraft(broken, KEY)).not.toThrow()
    expect(loadDraft(broken, KEY, PAYLOAD.types)).toBeNull()
    expect(loadDraft(null, KEY, PAYLOAD.types)).toBeNull()
  })
})
