import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearDraft,
  draftKey,
  loadDraft,
  saveDraft,
  sweepDrafts,
  type Draft,
} from '@/games/matchscale/draft'
import type { MatchScalePayload } from '@/games/matchscale/types'

const SILHOUETTE = {
  name: 'Alpha',
  path: 'M0 0L10 10Z',
  width: 1000,
  height: 600,
  attribution: null,
}
const PAYLOAD: MatchScalePayload = {
  categoryName: 'Flächen',
  a: SILHOUETTE,
  b: { ...SILHOUETTE, path: 'M0 0L20 20Z' },
  toleranceFactor: 1.1,
}
const KEY = draftKey({ userId: 'u1', payload: PAYLOAD, timed: false })
const DRAFT: Draft = { v: 1, b: { x: 5, y: 0.5, scale: 1.3 }, zoom: 1.5, centre: { x: 4, y: 2 } }
const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 19, 12)

function otherRound(path: string, timed = false): string {
  return draftKey({ userId: 'u1', payload: { ...PAYLOAD, b: { ...PAYLOAD.b, path } }, timed })
}

describe('draft', () => {
  beforeEach(() => localStorage.clear())

  it('is keyed by player, round and phase', () => {
    expect(KEY).toMatch(/^match-scale:draft:u1:1:[0-9a-f]{8}$/)
    expect(draftKey({ userId: 'u1', payload: PAYLOAD, timed: true })).toMatch(
      /^match-scale:draft:u1:2:[0-9a-f]{8}$/,
    )
    expect(draftKey({ userId: 'u2', payload: PAYLOAD, timed: false })).not.toBe(KEY)

    const other = { ...PAYLOAD, b: { ...PAYLOAD.b, path: 'M0 0L30 30Z' } }
    expect(draftKey({ userId: 'u1', payload: other, timed: false })).not.toBe(KEY)
  })

  it('gives back what it saved, and nothing once cleared', () => {
    saveDraft(localStorage, KEY, DRAFT)
    expect(loadDraft(localStorage, KEY)).toEqual(DRAFT)

    clearDraft(localStorage, KEY)
    expect(loadDraft(localStorage, KEY)).toBeNull()
  })

  it('discards what it cannot read, rather than repairing it', () => {
    for (const raw of [
      '{',
      '"x"',
      JSON.stringify({ ...DRAFT, v: 2 }),
      JSON.stringify({ ...DRAFT, b: { x: 1, y: 1, scale: 0 } }),
      JSON.stringify({ ...DRAFT, b: { x: 1, y: 1, scale: null } }),
      JSON.stringify({ ...DRAFT, zoom: 0 }),
      JSON.stringify({ ...DRAFT, centre: { x: 'a', y: 1 } }),
      JSON.stringify({ v: 1 }),
    ]) {
      localStorage.setItem(KEY, raw)
      expect(loadDraft(localStorage, KEY)).toBeNull()
      expect(localStorage.getItem(KEY)).toBeNull()
    }
  })

  it("sweeps the same player's old drafts, spares fresh ones and everybody else's", () => {
    const fresh = otherRound('M0 0L1 1Z')
    const old = otherRound('M0 0L2 2Z', true)
    const timeless = otherRound('M0 0L3 3Z')
    const theirs = draftKey({ userId: 'u2', payload: PAYLOAD, timed: true })
    saveDraft(localStorage, KEY, DRAFT, NOW)
    saveDraft(localStorage, fresh, DRAFT, NOW - 47 * HOUR)
    saveDraft(localStorage, old, DRAFT, NOW - 49 * HOUR)
    saveDraft(localStorage, theirs, DRAFT, NOW - 49 * HOUR)
    localStorage.setItem(timeless, JSON.stringify(DRAFT))

    sweepDrafts(localStorage, KEY, NOW)

    expect(localStorage.getItem(KEY)).not.toBeNull()
    expect(localStorage.getItem(fresh)).not.toBeNull()
    expect(localStorage.getItem(theirs)).not.toBeNull()
    expect(localStorage.getItem(old)).toBeNull()
    expect(localStorage.getItem(timeless)).toBeNull()
  })

  it('sweeps nothing for a key that is not one of its own', () => {
    const old = otherRound('M0 0L2 2Z')
    saveDraft(localStorage, old, DRAFT, NOW - 49 * HOUR)

    sweepDrafts(localStorage, 'k', NOW)

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
    } as unknown as Storage

    expect(() => saveDraft(broken, KEY, DRAFT)).not.toThrow()
    expect(loadDraft(broken, KEY)).toBeNull()
    expect(loadDraft(null, KEY)).toBeNull()
  })
})
