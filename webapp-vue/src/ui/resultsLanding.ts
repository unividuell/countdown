/**
 * The moment a reveal's results start landing, for a surface beside the game that must not say
 * them first — the roster above the card. The reveal's table announces it (`RevealScoreboard`),
 * together with the verdict; nothing here knows which game is playing.
 *
 *   guess ──▶ roster fetches, holds the answer
 *   reveal ──▶ … ──▶ verdict + first row ──announceResults()──▶ roster shows it
 *                    or SPOILER_HOLD_MS, whichever comes first
 */

/**
 * The ceiling, for a hold no reveal ends: a background tab, a reveal without a table. Above the
 * longest reveal we have — Verrohrung's dry run: beat 900 ms, turn 150 ms, water 2 s, the dry
 * sound's 3.7 s and a 0.2 s breath ≈ 7 s.
 */
export const SPOILER_HOLD_MS = 7500

let waiting = new Set<() => void>()

/** A reveal's first row is landing now. */
export function announceResults(): void {
  for (const land of [...waiting]) land()
}

/** [apply] once, on the next announcement or at the ceiling; returns the cancel. */
export function afterResultsLand(apply: () => void): () => void {
  const timer = setTimeout(land, SPOILER_HOLD_MS)
  waiting.add(land)

  function cancel(): void {
    clearTimeout(timer)
    waiting.delete(land)
  }

  function land(): void {
    cancel()
    apply()
  }

  return cancel
}

export function _resetResultsLandingState(): void {
  waiting = new Set()
}
