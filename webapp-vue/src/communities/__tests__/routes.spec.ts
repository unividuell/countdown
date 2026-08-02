import { describe, expect, it } from 'vitest'
import { communityPath } from '@/communities/routes'

describe('communityPath', () => {
  it('builds the community root with a trailing slash', () => {
    expect(communityPath('team')).toBe('/team/')
  })

  it('builds each sub-page without a trailing slash', () => {
    expect(communityPath('team', 'members')).toBe('/team/members')
    expect(communityPath('team', 'requests')).toBe('/team/requests')
    expect(communityPath('team', 'settings')).toBe('/team/settings')
  })
})
