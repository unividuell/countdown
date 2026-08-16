/**
 * Guess Hue's wire shapes. Live beside the component rather than in either caller's own types
 * (`gamelab/types.ts` or the round's), because both a lab round and a real round carry the same
 * payload and solution for this game — putting them in either caller would point the other one
 * at it.
 */

/** Guess Hue's payload. The target hue is absent by design — see the backend's field-set test. */
export interface GuessHuePayload {
  description: string
  initHue: number
  /** Fractions, not percent. */
  saturation: number
  lightness: number
  /**
   * Half-window in degrees, or `null` in phase two — there is no gate there, only the closest
   * guess scores. Safe to see before guessing: it is set from the phase alone, identical for
   * every round of that phase, so it says nothing about where the target hue lies. See the
   * backend's `GuessHuePayload` KDoc.
   */
  toleranceDeg: number | null
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
