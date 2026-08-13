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
}

/** Guess Hue's payload. The target hue is absent by design — see the backend's field-set test. */
export interface GuessHuePayload {
  description: string
  initHue: number
  /** Fractions, not percent. */
  saturation: number
  lightness: number
}

/** Guess Hue's solution. It reaches the client only once `me` is set — see the backend's gate. */
export interface GuessHueSolution {
  targetHue: number
  /**
   * Half-window in degrees, or `null` in phase two — there is no gate there, only the closest guess
   * scores. The drawing chain models "no window" as `<= 0`, so the adapter maps `null` to `0` at the
   * boundary rather than threading a nullable through three components.
   */
  toleranceDeg: number | null
}
