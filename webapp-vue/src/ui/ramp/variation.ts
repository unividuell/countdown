export const TILTS = [-9, 0, 9] as const

/** Hash spreading the tilt over the rounds. */
function mix(n: number): number {
  let h = Math.imul(n + 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)

  return (h ^ (h >>> 16)) >>> 0
}

/** Poster look from the round number alone: same round, same poster. */
export function posterOf(roundNumber: number): { tilt: -9 | 0 | 9 } {
  return { tilt: TILTS[mix(roundNumber) % 3] ?? 0 }
}
