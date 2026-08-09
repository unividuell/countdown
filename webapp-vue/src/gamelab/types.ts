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
  /** `null` where the game accepts guesses without scoring them. */
  outcome: unknown
  /** Display order only. The lab does not score time. */
  at: string
}

export interface LabRoundResponse<P = unknown> {
  seed: number
  game: string
  displayName: string
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
  /** Half-window, in degrees. `0` means "no window", not "no tolerance information". */
  toleranceDeg: number
}
