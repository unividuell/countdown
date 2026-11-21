// The steps a progress climbs, by ear: Musterung's marked blocks, a cover's count-in.

const C5_HZ = 523.25
/** Semitones above C of the major scale's steps. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

/** The `step`-th step of C major from C5, from 0: C5, D5, E5, … on into the next octave. */
export function scaleHz(step: number): number {
  const at = Math.max(0, step)
  const semitones = 12 * Math.floor(at / MAJOR.length) + MAJOR[at % MAJOR.length]!

  return C5_HZ * 2 ** (semitones / 12)
}
