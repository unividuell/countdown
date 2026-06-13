import { describe, expect, it } from 'vitest'
import { resolveLanding } from '@/communities/useCommunities'

describe('resolveLanding', () => {
  const a = { id: '1', name: 'A', slug: 'a' }
  const b = { id: '2', name: 'B', slug: 'b' }
  it('none when no active communities', () => expect(resolveLanding([], null)).toEqual({ kind: 'none' }))
  it('one when exactly one', () => expect(resolveLanding([a], null)).toEqual({ kind: 'one', slug: 'a' }))
  it('last-selected when many and selection is still active', () =>
    expect(resolveLanding([a, b], '2')).toEqual({ kind: 'last', slug: 'b' }))
  it('choose when many and selection is stale/missing', () =>
    expect(resolveLanding([a, b], '999')).toEqual({ kind: 'choose' }))
})
