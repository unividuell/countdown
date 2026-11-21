import { beforeEach, describe, expect, it } from 'vitest'
import { clearDraft, draftKey, loadDraft, saveDraft, sweepDrafts } from '@/games/turnpipes/draft'
import type { TurnPipesPayload } from '@/games/turnpipes/types'

const SIZE = 6
const PAYLOAD: TurnPipesPayload = {
  size: SIZE,
  kinds: Array.from({ length: 36 }, () => 'ELBOW'),
  start: Array.from({ length: 36 }, () => 0),
}
const ROTATIONS = Array.from({ length: 36 }, (_, i) => i % 4)
const KEY = draftKey({ userId: 'u1', payload: PAYLOAD, timed: false })
const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 18, 12)
const OLD = NOW - 49 * HOUR
const FRESH = NOW - 47 * HOUR

function otherRound(cell: number, timed = false): string {
  const start = PAYLOAD.start.map((turn, i) => (i === cell ? 1 : turn))

  return draftKey({ userId: 'u1', payload: { ...PAYLOAD, start }, timed })
}

describe('draft', () => {
  beforeEach(() => localStorage.clear())

  it('is keyed by player, round and phase', () => {
    expect(KEY).toMatch(/^turn-pipes:draft:u1:1:[0-9a-f]{8}$/)
    expect(draftKey({ userId: 'u1', payload: PAYLOAD, timed: true })).toMatch(
      /^turn-pipes:draft:u1:2:[0-9a-f]{8}$/,
    )
    expect(draftKey({ userId: 'u2', payload: PAYLOAD, timed: false })).not.toBe(KEY)
    expect(otherRound(1)).not.toBe(KEY)
  })

  it('gives back what it saved, and nothing once cleared', () => {
    saveDraft(localStorage, KEY, ROTATIONS)
    expect(loadDraft(localStorage, KEY, SIZE)).toEqual(ROTATIONS)

    clearDraft(localStorage, KEY)
    expect(loadDraft(localStorage, KEY, SIZE)).toBeNull()
  })

  it('stores the rotations, stamped with the save time', () => {
    saveDraft(localStorage, KEY, [0, 1], 1234)

    expect(localStorage.getItem(KEY)).toBe('{"v":1,"at":1234,"rotations":[0,1]}')
  })

  it('discards what it cannot read, rather than repairing it', () => {
    const wrongLength = ROTATIONS.slice(1)
    const fours = [...ROTATIONS.slice(1), 4]
    for (const raw of [
      '{',
      '"x"',
      JSON.stringify({ v: 1, rotations: wrongLength }),
      JSON.stringify({ v: 1, rotations: fours }),
      JSON.stringify({ v: 2, rotations: ROTATIONS }),
    ]) {
      localStorage.setItem(KEY, raw)
      expect(loadDraft(localStorage, KEY, SIZE)).toBeNull()
      expect(localStorage.getItem(KEY)).toBeNull()
    }
  })

  it("sweeps the same player's old drafts, spares fresh ones and everybody else's", () => {
    const fresh = otherRound(1)
    const old = otherRound(2)
    const timeless = otherRound(3)
    const theirs = draftKey({ userId: 'u2', payload: PAYLOAD, timed: true })
    saveDraft(localStorage, KEY, ROTATIONS, NOW)
    saveDraft(localStorage, fresh, ROTATIONS, FRESH)
    saveDraft(localStorage, old, ROTATIONS, OLD)
    saveDraft(localStorage, theirs, ROTATIONS, OLD)
    localStorage.setItem(timeless, '{"v":1,"rotations":[]}')
    localStorage.setItem('infobox:turn-pipes', 'true')

    sweepDrafts(localStorage, KEY, NOW)

    expect(localStorage.getItem(KEY)).not.toBeNull()
    expect(localStorage.getItem(fresh)).not.toBeNull()
    expect(localStorage.getItem(theirs)).not.toBeNull()
    expect(localStorage.getItem('infobox:turn-pipes')).toBe('true')
    expect(localStorage.getItem(old)).toBeNull()
    expect(localStorage.getItem(timeless)).toBeNull()
  })

  it('sweeps nothing for a key that is not one of its own', () => {
    const old = otherRound(2)
    saveDraft(localStorage, old, ROTATIONS, OLD)

    expect(() => sweepDrafts(localStorage, 'k', NOW)).not.toThrow()

    expect(localStorage.getItem(old)).not.toBeNull()
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

    expect(() => saveDraft(broken, KEY, ROTATIONS)).not.toThrow()
    expect(() => sweepDrafts(broken, KEY)).not.toThrow()
    expect(() => clearDraft(broken, KEY)).not.toThrow()
    expect(loadDraft(broken, KEY, SIZE)).toBeNull()
    expect(loadDraft(null, KEY, SIZE)).toBeNull()
  })
})
