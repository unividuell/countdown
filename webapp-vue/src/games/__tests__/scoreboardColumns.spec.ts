import { describe, expect, it } from 'vitest'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import { rowHead } from '@/games/scoreboardColumns'

describe('rowHead', () => {
  it('reads the player, the score and the clock off the entry', () => {
    const entry = gameEntry({
      userId: 'a',
      username: 'Anna',
      avatar: { bgColorHex: '#111111' },
      points: 3,
      durationMs: 65_000,
    })

    expect(rowHead(entry, 'ALL_QUALIFYING')).toEqual({
      userId: 'a',
      name: 'Anna',
      colorHex: '#111111',
      ink: '#ffffff',
      points: 3,
      provisional: false,
      durationLabel: '01:05',
    })
  })

  it('calls a positive score provisional while only the closest is paid', () => {
    expect(rowHead(gameEntry({ points: 3 }), 'CLOSEST_ONLY').provisional).toBe(true)
  })

  it('has no clock for a round that does not score on time', () => {
    expect(rowHead(gameEntry({ durationMs: null }), null).durationLabel).toBeNull()
  })
})
