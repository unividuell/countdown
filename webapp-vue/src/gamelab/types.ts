import type { AvatarView } from '@/api/types'

/**
 * Lab types live here rather than in `src/api/types.ts` so the whole non-prod harness is one
 * directory plus one page — deletable, or rewritten wholesale, without touching product types.
 */
export interface LabEntryDto {
  userId: string
  username: string
  avatar: AvatarView
  guess: unknown
  outcome: unknown
  /** Display order only. The lab does not score time. */
  at: string
}

export interface LabRoundResponse<P = unknown> {
  seed: number
  game: string
  displayName: string
  payload: P
  me: LabEntryDto | null
  others: LabEntryDto[]
  /** True when this request displaced a round that was open on a different seed. */
  tookOverRound: boolean
}

/** The stand-in game's shapes. A real game brings its own alongside these. */
export interface SamplePayload {
  lowerBound: number
  upperBound: number
}
export interface SampleOutcome {
  correct: boolean
  distance: number
  direction: 'HIGHER' | 'LOWER' | 'EXACT'
}
