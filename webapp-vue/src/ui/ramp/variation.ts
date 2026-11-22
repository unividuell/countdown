export type PosterStyle = 'band' | 'sheet'
export type FaceName = 'system' | 'fraunces-digits'

export const TILTS = [-9, 0, 9] as const

const FACES: readonly FaceName[] = ['system', 'fraunces-digits']

/** Hash spreading tilt and face; style alternates by parity instead. */
function mix(n: number): number {
  let h = Math.imul(n + 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)

  return (h ^ (h >>> 16)) >>> 0
}

/** Poster look from the round number alone: same round, same poster. */
export function posterOf(roundNumber: number): {
  style: PosterStyle
  tilt: -9 | 0 | 9
  face: FaceName
} {
  const h = mix(roundNumber)

  return {
    style: Math.abs(roundNumber) % 2 === 0 ? 'band' : 'sheet',
    tilt: TILTS[h % 3] ?? 0,
    face: FACES[(h >>> 8) % 2] ?? 'system',
  }
}
