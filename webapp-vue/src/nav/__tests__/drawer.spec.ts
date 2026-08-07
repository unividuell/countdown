import { describe, expect, it } from 'vitest'
import { communityEntries, spinDegrees } from '@/nav/drawer'
import type { CommunitySummary } from '@/api/types'

const c = (id: string, name: string, slug: string): CommunitySummary => ({ id, name, slug })

describe('communityEntries', () => {
  it('sorts by German collation, not by code point', () => {
    // 'Ä' is U+00C4 — after 'Z' by code point, next to 'A' under German collation.
    // A plain `a.name < b.name` would put Älpler last and pass every other assertion here.
    const entries = communityEntries(
      [c('3', 'Zugspitze', 'zug'), c('1', 'Älpler', 'aelpler'), c('2', 'Berghütte', 'berg')],
      null,
    )
    expect(entries.map((e) => e.name)).toEqual(['Älpler', 'Berghütte', 'Zugspitze'])
  })

  it('keeps the community in context in the list and flags it', () => {
    const entries = communityEntries([c('1', 'Alpha', 'alpha'), c('2', 'Beta', 'beta')], 'beta')
    expect(entries.map((e) => e.slug)).toEqual(['alpha', 'beta'])
    expect(entries.map((e) => e.current)).toEqual([false, true])
  })

  it('flags nothing when no community is in context', () => {
    const entries = communityEntries([c('1', 'Alpha', 'alpha')], null)
    expect(entries.every((e) => !e.current)).toBe(true)
  })

  it('does not mutate its input', () => {
    const list = [c('2', 'Beta', 'beta'), c('1', 'Alpha', 'alpha')]
    communityEntries(list, null)
    expect(list.map((x) => x.slug)).toEqual(['beta', 'alpha'])
  })

  it('answers an empty list with an empty list', () => {
    expect(communityEntries([], null)).toEqual([])
  })
})

describe('spinDegrees', () => {
  it('turns 319px of travel into 1142.33° for the 32px avatar', () => {
    // 319 / 16 rad = 19.9375 rad = 1142.3346…° — 3.17 full turns.
    expect(spinDegrees(319, 32)).toBeCloseTo(1142.33, 1)
  })

  it('is linear in the travel', () => {
    expect(spinDegrees(640, 32)).toBeCloseTo(2 * spinDegrees(320, 32), 6)
  })

  it('is 0 before anything has a width', () => {
    expect(spinDegrees(0, 32)).toBe(0)
    expect(spinDegrees(319, 0)).toBe(0)
  })
})
