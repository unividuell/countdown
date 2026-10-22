import { beforeEach, describe, expect, it } from 'vitest'
import { fingerprint } from '@/games/drafts'
import { draftKey, draftPrefix, loadDraft, saveDraft } from '@/games/paintratio/draft'
import type { PaintState } from '@/games/paintratio/paintHistory'
import {
  COORDINATE_LIMIT,
  MAX_PATH,
  MAX_POINTS,
  MAX_STROKES,
  pathOf,
} from '@/games/paintratio/types'
import type { Stroke } from '@/games/paintratio/types'

const ROUND = '/api/communities/x/rounds/12/assets/target?round=r1'
const KEY = draftKey({ userId: 'u1', assetUrl: ROUND })
const BRUSHES = 3

const BLUE: Stroke = { brush: 1, color: '#3049e8', points: [0, 0, 120, 80, 300, 60] }
const GREEN: Stroke = { brush: 0, color: '#008000', points: [-40, 10, 15, 900] }
const RED: Stroke = { brush: 2, color: '#ff0000', points: [7, 7] }
const PAINT: PaintState = { strokes: [BLUE, GREEN], redo: [RED] }

/** A stored draft with one field changed, as the raw text `localStorage` holds. */
function stored(change: Record<string, unknown>): string {
  return JSON.stringify({ v: 1, at: 1234, strokes: [BLUE], redo: [], ...change })
}

function zigzag(segments: number): number[] {
  return Array.from({ length: segments + 1 }, (_, i) => [
    i % 2 === 0 ? 0 : COORDINATE_LIMIT,
    0,
  ]).flat()
}

describe('draft', () => {
  beforeEach(() => localStorage.clear())

  it('keys a draft by player and round address', () => {
    const a = draftKey({
      userId: 'u1',
      assetUrl: '/api/communities/x/rounds/12/assets/target?round=r1',
    })
    const b = draftKey({
      userId: 'u1',
      assetUrl: '/api/communities/x/rounds/12/assets/target?round=r2',
    })

    expect(a).toMatch(/^paint-ratio:draft:u1:[0-9a-f]{8}$/)
    expect(a).not.toBe(b)
    expect(draftKey({ userId: 'u2', assetUrl: ROUND })).not.toBe(a)
    expect(draftKey({ userId: 'u1', assetUrl: ROUND })).toBe(a)
  })

  it('fingerprints the address with the shared hash', () => {
    expect(KEY).toBe(`paint-ratio:draft:u1:${fingerprint(ROUND)}`)
  })

  it("prefixes every key of one player, and no other player's", () => {
    expect(KEY.startsWith(draftPrefix('u1'))).toBe(true)
    expect(draftKey({ userId: 'u10', assetUrl: ROUND }).startsWith(draftPrefix('u1'))).toBe(false)
  })

  it('saves and loads strokes and redo', () => {
    saveDraft(localStorage, KEY, PAINT)

    expect(loadDraft(localStorage, KEY, BRUSHES)).toEqual(PAINT)
  })

  it('gives back a painting nobody has started as bare', () => {
    saveDraft(localStorage, KEY, { strokes: [], redo: [] })

    expect(loadDraft(localStorage, KEY, BRUSHES)).toEqual({ strokes: [], redo: [] })
  })

  it('stores the strokes and the redo, stamped with the save time', () => {
    saveDraft(localStorage, KEY, { strokes: [BLUE], redo: [RED] }, 1234)

    expect(localStorage.getItem(KEY)).toBe(
      '{"v":1,"at":1234,"strokes":[{"brush":1,"color":"#3049e8","points":[0,0,120,80,300,60]}],' +
        '"redo":[{"brush":2,"color":"#ff0000","points":[7,7]}]}',
    )
  })

  it('stamps the save with the clock by default', () => {
    const before = Date.now()
    saveDraft(localStorage, KEY, PAINT)

    const at = (JSON.parse(localStorage.getItem(KEY)!) as { at: number }).at
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(Date.now())
  })

  it('loads a draft that carries no save time', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, strokes: [BLUE], redo: [] }))

    expect(loadDraft(localStorage, KEY, BRUSHES)).toEqual({ strokes: [BLUE], redo: [] })
  })

  it('answers null where nothing was saved, and leaves other keys alone', () => {
    localStorage.setItem('infobox:paint-ratio', 'true')

    expect(loadDraft(localStorage, KEY, BRUSHES)).toBeNull()
    expect(localStorage.getItem('infobox:paint-ratio')).toBe('true')
  })

  it('discards a draft that no longer fits', () => {
    expect(pathOf(zigzag(MAX_PATH / COORDINATE_LIMIT + 1))).toBeGreaterThan(MAX_PATH)

    for (const raw of [
      '{',
      '"x"',
      'null',
      stored({ v: 2 }),
      stored({ strokes: undefined }),
      stored({ redo: undefined }),
      stored({ strokes: 'none' }),
      // brush 3 is out of range for three brushes
      stored({ strokes: [{ ...BLUE, brush: 3 }] }),
      stored({ strokes: [{ ...BLUE, brush: -1 }] }),
      // the server rejects an upper-case colour
      stored({ strokes: [{ ...BLUE, color: '#3049E8' }] }),
      stored({ redo: [{ ...RED, color: '#FF0000' }] }),
      stored({ strokes: [{ ...BLUE, color: 'blue' }] }),
      stored({ strokes: [{ ...BLUE, points: [0, 0.5] }] }),
      stored({ strokes: [{ ...BLUE, points: [0, COORDINATE_LIMIT + 1] }] }),
      stored({ strokes: [{ ...BLUE, points: [0, 0, 5] }] }),
      stored({ strokes: [{ ...BLUE, points: [] }] }),
      stored({ strokes: [{ brush: 0, color: '#3049e8' }] }),
      // too many points for one stroke, then too many for the whole painting
      stored({ strokes: [{ ...BLUE, points: new Array<number>(2 * MAX_POINTS + 2).fill(0) }] }),
      stored({
        strokes: [
          { ...BLUE, points: new Array<number>(2 * MAX_POINTS).fill(0) },
          { ...BLUE, points: [0, 0] },
        ],
      }),
      stored({ redo: [{ ...RED, points: new Array<number>(2 * MAX_POINTS + 2).fill(0) }] }),
      // too many strokes
      stored({ strokes: new Array<Stroke>(MAX_STROKES + 1).fill(RED) }),
      // a path longer than the server takes
      stored({ strokes: [{ ...BLUE, points: zigzag(MAX_PATH / COORDINATE_LIMIT + 1) }] }),
    ]) {
      localStorage.setItem(KEY, raw)

      expect(loadDraft(localStorage, KEY, BRUSHES), raw.slice(0, 120)).toBeNull()
      expect(localStorage.getItem(KEY), raw.slice(0, 120)).toBeNull()
    }
  })

  it('keeps a draft at the limits', () => {
    const atTheEdge: Stroke = { ...BLUE, points: zigzag(MAX_PATH / COORDINATE_LIMIT) }
    const many = new Array<Stroke>(MAX_STROKES).fill(RED)
    saveDraft(localStorage, KEY, { strokes: [atTheEdge], redo: [] })

    expect(loadDraft(localStorage, KEY, BRUSHES)?.strokes).toEqual([atTheEdge])

    saveDraft(localStorage, KEY, { strokes: many, redo: [] })

    expect(loadDraft(localStorage, KEY, BRUSHES)?.strokes).toHaveLength(MAX_STROKES)
  })

  it('reads the brushes the round has, not a fixed three', () => {
    saveDraft(localStorage, KEY, { strokes: [{ ...BLUE, brush: 3 }], redo: [] })

    expect(loadDraft(localStorage, KEY, 4)?.strokes).toEqual([{ ...BLUE, brush: 3 }])
    expect(loadDraft(localStorage, KEY, 3)).toBeNull()
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

    expect(() => saveDraft(null, KEY, PAINT)).not.toThrow()
    expect(() => saveDraft(broken, KEY, PAINT)).not.toThrow()
    expect(loadDraft(null, KEY, BRUSHES)).toBeNull()
    expect(loadDraft(broken, KEY, BRUSHES)).toBeNull()
  })
})
