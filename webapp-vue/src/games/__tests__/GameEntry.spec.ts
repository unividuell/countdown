import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import type { LabEntryDto } from '@/gamelab/types'
import type { MyPlayDto, OtherPlayDto } from '@/api/types'

/**
 * The point of `GameEntry` is that no world has to map into it. These assignments are the test:
 * if any of the three wire types stops satisfying it structurally, this file stops compiling.
 */
describe('GameEntry', () => {
  it('is satisfied by all three wire types, review fields included', () => {
    const mine: MyPlayDto = {
      userId: 'u',
      username: 'A',
      avatar: { shortName: 'A', bgColorHex: '#000' },
      stage: 0,
      guess: null,
      outcome: null,
      points: 1,
      durationMs: null,
      revealedAt: '2026-08-29T10:00:00Z',
      guessedAt: '2026-08-29T10:01:00Z',
      votes: [{ userId: 'v', username: 'B', value: 'FLAG' }],
      struck: false,
      adminOverride: null,
    }
    const other: OtherPlayDto = { ...mine } as OtherPlayDto
    const lab: LabEntryDto = {
      userId: 'u',
      username: 'A',
      avatar: { shortName: 'A', bgColorHex: '#000' },
      guess: null,
      outcome: null,
      at: '2026-08-29T10:01:00Z',
      points: 1,
      stage: 0,
      durationMs: null,
      votes: [],
      struck: false,
      adminOverride: null,
    }

    const entries: GameEntry[] = [mine, other, lab]

    expect(entries).toHaveLength(3)
    expect(entries[0]?.votes[0]?.value).toBe('FLAG')
  })
})
