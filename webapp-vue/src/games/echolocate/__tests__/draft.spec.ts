import { beforeEach, describe, expect, it } from 'vitest'
import { fingerprint } from '@/games/drafts'
import { draftKey, draftPrefix, loadDraft, saveDraft } from '@/games/echolocate/draft'
import type { EchoDraft } from '@/games/echolocate/draft'
import type { EchoLocatePayload } from '@/games/echolocate/types'

const ROUND = '/api/communities/x/rounds/12/assets/clip-0?round=r1'
const KEY = draftKey({ userId: 'u1', assetUrl: ROUND })

const PAYLOAD: EchoLocatePayload = {
  grid: 20,
  reach: 12,
  speed: 3,
  pings: 3,
  clips: 2,
  bedDb: -24,
  noiseDb: 0,
  toleranceCells: 1,
}

const DRAFT: EchoDraft = {
  rings: [[5.8, 9.4], [], [7.2]],
  pins: [
    { x: 9.6, y: 4.1 },
    { x: 15.2, y: 13.9 },
  ],
}

/** A stored draft with one field changed, as the raw text `localStorage` holds. */
function stored(change: Record<string, unknown>): string {
  return JSON.stringify({ v: 1, at: 1234, rings: DRAFT.rings, pins: DRAFT.pins, ...change })
}

describe('draft', () => {
  beforeEach(() => localStorage.clear())

  it('keeps rings and pins per player and round', () => {
    const a = draftKey({ userId: 'u1', assetUrl: ROUND })
    const b = draftKey({ userId: 'u1', assetUrl: ROUND.replace('r1', 'r2') })

    expect(a).toMatch(/^echo-locate:draft:u1:[0-9a-f]{8}$/)
    expect(a).toBe(`echo-locate:draft:u1:${fingerprint(ROUND)}`)
    expect(a).not.toBe(b)
    expect(draftKey({ userId: 'u2', assetUrl: ROUND })).not.toBe(a)
    expect(draftKey({ userId: 'u1', assetUrl: ROUND })).toBe(a)
  })

  it("prefixes every key of one player, and no other player's", () => {
    expect(KEY.startsWith(draftPrefix('u1'))).toBe(true)
    expect(draftKey({ userId: 'u10', assetUrl: ROUND }).startsWith(draftPrefix('u1'))).toBe(false)
  })

  it('saves and loads rings and pins', () => {
    saveDraft(localStorage, KEY, DRAFT)

    expect(loadDraft(localStorage, KEY, PAYLOAD)).toEqual(DRAFT)
  })

  it('gives back a field nobody has played as bare, and a half-placed pair of pins', () => {
    saveDraft(localStorage, KEY, { rings: [], pins: [] })

    expect(loadDraft(localStorage, KEY, PAYLOAD)).toEqual({ rings: [], pins: [] })

    saveDraft(localStorage, KEY, { rings: [[3]], pins: [{ x: 1, y: 2 }] })

    expect(loadDraft(localStorage, KEY, PAYLOAD)).toEqual({
      rings: [[3]],
      pins: [{ x: 1, y: 2 }],
    })
  })

  it('stores rings and pins, stamped with the save time', () => {
    saveDraft(localStorage, KEY, { rings: [[5.5], []], pins: [{ x: 1, y: 2 }] }, 1234)

    expect(localStorage.getItem(KEY)).toBe(
      '{"v":1,"at":1234,"rings":[[5.5],[]],"pins":[{"x":1,"y":2}]}',
    )
  })

  it('stamps the save with the clock by default', () => {
    const before = Date.now()
    saveDraft(localStorage, KEY, DRAFT)

    const at = (JSON.parse(localStorage.getItem(KEY)!) as { at: number }).at
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(Date.now())
  })

  it('loads a draft that carries no save time', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, rings: DRAFT.rings, pins: DRAFT.pins }))

    expect(loadDraft(localStorage, KEY, PAYLOAD)).toEqual(DRAFT)
  })

  it('answers null where nothing was saved, and leaves other keys alone', () => {
    localStorage.setItem('infobox:echo-locate', 'true')

    expect(loadDraft(localStorage, KEY, PAYLOAD)).toBeNull()
    expect(localStorage.getItem('infobox:echo-locate')).toBe('true')
  })

  it('drops a draft that does not fit the payload', () => {
    for (const raw of [
      '{',
      '"x"',
      'null',
      '[]',
      stored({ v: 2 }),
      stored({ v: undefined }),
      stored({ rings: undefined }),
      stored({ pins: undefined }),
      stored({ rings: 'none' }),
      stored({ pins: 'none' }),
      // three pins for two clips
      stored({ pins: [...DRAFT.pins, { x: 1, y: 1 }] }),
      // four ring lists for three pings
      stored({ rings: [[], [], [], []] }),
      // three radii for two clips
      stored({ rings: [[1, 2, 3]] }),
      stored({ rings: [5] }),
      stored({ rings: [[-0.1]] }),
      stored({ rings: [[40.1]] }),
      stored({ rings: [['5']] }),
      stored({ rings: [[null]] }),
      stored({ pins: [{ x: -0.1, y: 1 }] }),
      stored({ pins: [{ x: 1, y: 20.1 }] }),
      stored({ pins: [{ x: 1 }] }),
      stored({ pins: [{ x: 1, y: 1, name: 'a' }] }),
      stored({ pins: [[1, 2]] }),
    ]) {
      localStorage.setItem(KEY, raw)

      expect(loadDraft(localStorage, KEY, PAYLOAD), raw).toBeNull()
      expect(localStorage.getItem(KEY), raw).toBeNull()
    }
  })

  it('keeps a draft at the limits', () => {
    const edge: EchoDraft = {
      rings: [
        [0, 40],
        [40, 0],
        [20, 20],
      ],
      pins: [
        { x: 0, y: 20 },
        { x: 20, y: 0 },
      ],
    }
    saveDraft(localStorage, KEY, edge)

    expect(loadDraft(localStorage, KEY, PAYLOAD)).toEqual(edge)
  })

  it('reads the clips and pings the round has, not fixed ones', () => {
    saveDraft(localStorage, KEY, DRAFT)

    expect(loadDraft(localStorage, KEY, { ...PAYLOAD, clips: 1 })).toBeNull()

    saveDraft(localStorage, KEY, DRAFT)

    expect(loadDraft(localStorage, KEY, { ...PAYLOAD, pings: 2 })).toBeNull()
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

    expect(() => saveDraft(null, KEY, DRAFT)).not.toThrow()
    expect(() => saveDraft(broken, KEY, DRAFT)).not.toThrow()
    expect(loadDraft(null, KEY, PAYLOAD)).toBeNull()
    expect(loadDraft(broken, KEY, PAYLOAD)).toBeNull()
  })
})
