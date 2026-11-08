import { afterEach, describe, expect, it } from 'vitest'
import {
  _resetCommunitiesState,
  resolveLanding,
  useCommunities,
} from '@/communities/useCommunities'

describe('resolveLanding', () => {
  const a = { id: '1', name: 'A', slug: 'a' }
  const b = { id: '2', name: 'B', slug: 'b' }
  it('none when no active communities', () =>
    expect(resolveLanding([], null)).toEqual({ kind: 'none' }))
  it('one when exactly one', () =>
    expect(resolveLanding([a], null)).toEqual({ kind: 'one', slug: 'a' }))
  it('last-selected when many and selection is still active', () =>
    expect(resolveLanding([a, b], '2')).toEqual({ kind: 'last', slug: 'b' }))
  it('choose when many and selection is stale/missing', () =>
    expect(resolveLanding([a, b], '999')).toEqual({ kind: 'choose' }))
})

describe('severalCommunities', () => {
  afterEach(() => _resetCommunitiesState())

  it('is false for one community and true from two on', () => {
    const { active, severalCommunities } = useCommunities()
    active.value = [{ id: '1', name: 'A', slug: 'a' }]
    expect(severalCommunities.value).toBe(false)
    active.value = [...active.value, { id: '2', name: 'B', slug: 'b' }]
    expect(severalCommunities.value).toBe(true)
  })
})
