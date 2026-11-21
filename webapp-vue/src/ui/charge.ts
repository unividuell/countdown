/**
 * Holding a `HoldButton` charges it: the ring, the sparks and the knocks all follow one curve, so
 * they cannot drift apart. Pure — the button draws it, `chargeSound.ts` plays it.
 *
 *   ring ▲                       ╱   constant speed
 *      1 │                    ╱
 *        │                 ╱
 *    1/3 │· · · · · · · ╱
 *        │         ..·´          gathering pace
 *      0 └──────────────┬──────────▶ time held
 *        0             RAMP      1
 *
 *   knocks  ♪      ♪   ♪  ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♩   one per equal piece of the ring, up a scale
 *   sparks  ·       ·   ·  · ·· ·· ··· ··· ····      more the fuller the ring
 */

/** The share of the hold spent gathering pace; after it the ring runs at one speed. */
export const RAMP = 0.5
/** The ring's speed after the ramp, in rings per hold: what makes it arrive at 1 on time. */
const SPEED = 1 / (1 - RAMP / 2)
const RING_AT_RAMP = (SPEED * RAMP) / 2

/** How full the ring is after `time` (0 … 1) of the hold. */
export function chargeCurve(time: number): number {
  if (time <= 0) return 0
  if (time >= 1) return 1

  return time < RAMP ? (SPEED * time * time) / (2 * RAMP) : SPEED * (time - RAMP / 2)
}

/** When the ring reaches `ring` (0 … 1): `chargeCurve` read backwards. */
export function chargeTimeOf(ring: number): number {
  return ring < RING_AT_RAMP ? Math.sqrt((2 * RAMP * ring) / SPEED) : ring / SPEED + RAMP / 2
}

const C4_HZ = 261.63
/** Semitones above the octave's C. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
/** Enough knocks for the even part of a 2 s hold to tick about every 70 ms. */
const OCTAVES = 3

/** C major from C4 to C7, 22 knocks: a run up the xylophone, bright rather than tense. */
export const CHARGE_HZ = [
  ...Array.from(
    { length: OCTAVES * MAJOR.length },
    (_, i) => C4_HZ * 2 ** (Math.floor(i / MAJOR.length) + MAJOR[i % MAJOR.length]! / 12),
  ),
  C4_HZ * 2 ** OCTAVES,
]

export interface ChargeKnock {
  /** Share of the hold, 0 … 1. */
  time: number
  hz: number
}

/**
 * One knock per equal piece of the ring, so the beat is the ring's own: slow, faster, then even.
 * The first comes with the press, the last with the full ring.
 */
export function chargeKnocks(): ChargeKnock[] {
  const last = CHARGE_HZ.length - 1

  return CHARGE_HZ.map((hz, i) => ({ time: chargeTimeOf(i / last), hz }))
}

/** Sparks per second off a ring this full. */
const SPARKS_PER_S = 160

export function sparkRate(ring: number): number {
  return SPARKS_PER_S * ring
}
