export const TILTS = [-9, 0, 9] as const
export const STYLES = ['band', 'raster'] as const

export type PosterStyle = (typeof STYLES)[number]

/** Hash spreading style and tilt over the rounds. */
function mix(n: number): number {
  let h = Math.imul(n + 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)

  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Poster look from the round number alone: same round, same poster, for every player. The tilt
 * takes the hash's remainder by 3, the style the quotient, so the two vary independently.
 */
export function posterOf(roundNumber: number): { style: PosterStyle; tilt: -9 | 0 | 9 } {
  const h = mix(roundNumber)

  return {
    style: STYLES[Math.floor(h / TILTS.length) % STYLES.length] ?? 'band',
    tilt: TILTS[h % TILTS.length] ?? 0,
  }
}
