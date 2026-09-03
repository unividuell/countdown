/**
 * Award rules shared by every mini-game's scoreboard — the frontend's mirror of the backend's own
 * `Awards.kt`. One copy, because every game's `provisional` cell means the same thing: whether the
 * server's own rule (`RoundPlayPoints.kt`) can still take a score away.
 */
import type { AwardRule } from '@/api/types'

/**
 * Whether a score can still be overtaken. Word for word the server's own rule
 * (`awardRule == CLOSEST_ONLY && points > 0`), mirrored here because a round's response carries the
 * rule but not the verdict. A zero is final even under „closest only“: whatever a game measures its
 * guesses against freezes on guessing, so a later guess can only take points away, never give them.
 */
export function isProvisional(points: number | null, awardRule: AwardRule | null): boolean {
  return awardRule === 'CLOSEST_ONLY' && points !== null && points > 0
}
