import type { AvatarView } from '@/api/types'

/**
 * Lab types live here rather than in `src/api/types.ts` so the whole non-prod harness is one
 * directory plus one page — deletable, or rewritten wholesale, without touching product types.
 */

/** Mirrors the server's `Phase`. The lab chooses it; a real round derives it from its round number. */
export type LabPhase = 'ONE' | 'TWO'

/** Mirrors the server's `AwardRule`. */
export type LabAwardRule = 'ALL_QUALIFYING' | 'CLOSEST_ONLY'

export interface LabEntryDto {
  userId: string
  username: string
  avatar: AvatarView
  guess: unknown
  /** `null` where the game accepts guesses without scoring them. */
  outcome: unknown
  /** Display order only. The lab does not score time. */
  at: string
  /** The server always sends a number — `0` means "guessed and scored nothing". */
  points: number
  /** The stage this entry was recorded at — same idea as `LabRoundResponse.myStage`, per entry. */
  stage: number
}

export interface LabRoundResponse<P = unknown> {
  seed: number
  game: string
  displayName: string
  phase: LabPhase
  payload: P
  /**
   * What the game revealed once the viewer had spent their guess; `null` in front of that gate.
   * `unknown` for the same reason `payload` is generic — the shape belongs to the game.
   */
  solution: unknown
  me: LabEntryDto | null
  others: LabEntryDto[]
  /** True when this request displaced a round that was open on a different seed. */
  tookOverRound: boolean
  awardRule: LabAwardRule
  awardPoints: number
  /** The viewer's own stage — `0` for a single-stage game, or a staged one not yet advanced. */
  myStage: number
}
