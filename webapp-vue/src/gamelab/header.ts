import { hash32 } from '@/gamelab/seed'

/**
 * What the lab puts in the game header's band. The band itself is the product's — `ui/GameHeader`
 * knows nothing about the lab — so the lab supplies the two numbers a real round would carry.
 *
 * Derived from the seed rather than rolled, because the seed is the lab's whole promise: the page
 * repairs it into the URL so a reload replays the same round, and a band that re-rolled on every
 * mount would be the one thing on the page contradicting that. Only the seconds move between
 * reloads.
 *
 * Hashed rather than taken modulo directly, so seeds a tester types by hand — 0, 1, 2 — land on
 * visibly different rounds instead of on a run of neighbours.
 */

/** T-0 … T-140: the same span a real edition's grid covers. */
const ROUND_MAX = 140

export function labRoundNumber(seed: number): number {
  return hash32(`${seed}:round`) % (ROUND_MAX + 1)
}

const MIN_MINUTES = 60
const MAX_MINUTES = 24 * 60

/**
 * A round that closes between an hour and a day from now — long enough that the readout is not
 * about to run out mid-review, short enough that the hour group stays two digits.
 */
export function labRoundEnd(seed: number, nowMs: number): string {
  const span = MAX_MINUTES - MIN_MINUTES
  const minutes = MIN_MINUTES + (hash32(`${seed}:end`) % (span + 1))
  return new Date(nowMs + minutes * 60_000).toISOString()
}
