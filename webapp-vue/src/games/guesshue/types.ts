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
   * guess scores. Unused before the guess: the wire shape matches `GuessHueSolution`, and only the
   * solution's copy of this field reaches the reveal. See the backend's `GuessHuePayload` KDoc.
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

/**
 * The one place a Guess Hue payload is narrowed — `unknown` by contract, like every game's. A
 * non-finite number counts as junk: it would end up as `NaN` in a transformation matrix.
 */
export function asGuessHuePayload(value: unknown): GuessHuePayload | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const { description, initHue, saturation, lightness, toleranceDeg } = raw

  if (typeof description !== 'string') return null
  if (!finite(initHue) || !finite(saturation) || !finite(lightness)) return null
  if (toleranceDeg !== null && !finite(toleranceDeg)) return null
  return { description, initHue, saturation, lightness, toleranceDeg }
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * The one place a Guess Hue guess is narrowed. Narrowed rather than cast: the shape is `unknown` by
 * contract, and a stale round from another game may be junk. `typeof` alone would let `NaN` through.
 */
export function hueOf(guess: unknown): number | null {
  if (typeof guess !== 'object' || guess === null) return null
  const hue = (guess as { hue?: unknown }).hue
  return typeof hue === 'number' && Number.isFinite(hue) ? hue : null
}
