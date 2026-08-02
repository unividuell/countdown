import { describe, expect, it } from 'vitest'
import { communityPath } from '@/communities/routes'

describe('communityPath', () => {
  it('builds the community root with a trailing slash', () => {
    expect(communityPath('team')).toBe('/c/team/')
  })

  it('builds each sub-page without a trailing slash', () => {
    expect(communityPath('team', 'members')).toBe('/c/team/members')
    expect(communityPath('team', 'requests')).toBe('/c/team/requests')
    expect(communityPath('team', 'settings')).toBe('/c/team/settings')
  })

  it('keeps communities out of the root namespace', () => {
    // The whole point of the prefix: a slug that matches an app route stays reachable.
    expect(communityPath('super-admin')).toBe('/c/super-admin/')
    expect(communityPath('communities')).toBe('/c/communities/')
  })
})
