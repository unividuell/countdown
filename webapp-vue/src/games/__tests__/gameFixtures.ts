/**
 * Fixtures every game's specs share. Typed on the contracts, so a field the framework adds is
 * one edit here rather than a grep through every spec.
 */
import { vi } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import type { GameProps } from '@/games/GameProps'

/** One player's entry: nothing guessed, nothing scored, no clock, no review. Named after its id. */
export function gameEntry(over: Partial<GameEntry> = {}): GameEntry {
  const userId = over.userId ?? 'u'
  return {
    userId,
    username: userId,
    stage: 0,
    guess: null,
    outcome: null,
    points: null,
    durationMs: null,
    avatar: { bgColorHex: '#7c3aed' },
    votes: [],
    struck: false,
    adminOverride: null,
    ...over,
  }
}

/**
 * A game's props, as a host hands them: every required one at its quietest — nothing played,
 * nothing revealed, no round rule. A spec adds what its case is about.
 */
export function gameProps(over: Partial<GameProps> = {}): GameProps {
  return {
    payload: null,
    outcome: null,
    myGuess: null,
    solution: null,
    entries: [],
    mineUserId: null,
    awardRule: null,
    awardPoints: null,
    disabled: false,
    review: {
      open: false,
      canOverride: false,
      vote: vi.fn().mockResolvedValue(undefined),
      override: vi.fn().mockResolvedValue(undefined),
    },
    ...over,
  }
}
