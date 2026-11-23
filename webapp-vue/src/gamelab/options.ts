import type { LocationQuery } from 'vue-router'
import type { LabPhase } from './types'

/**
 * Phase and ramp as the URL carries them. One reader for the index, which writes them into its
 * links, and the game page, which opens the round from them — a drift would open a round other
 * than the one the index showed as chosen.
 */

/** Anything other than exactly `TWO` reads as `ONE`: a junk value is visible at a glance. */
export function phaseFrom(query: LocationQuery): LabPhase {
  return query.phase === 'TWO' ? 'TWO' : 'ONE'
}

export function rampFrom(query: LocationQuery): boolean {
  return query.ramp === '1'
}

export function withPhase(query: LocationQuery, phase: LabPhase): LocationQuery {
  return { ...query, phase }
}

/** Off removes the key rather than writing `0`, so an untouched URL stays untouched. */
export function withRamp(query: LocationQuery, on: boolean): LocationQuery {
  const next = { ...query }
  if (on) next.ramp = '1'
  else delete next.ramp
  return next
}

/**
 * The index's link into a game. Only what differs from the game page's defaults goes in, so a
 * link with nothing chosen stays a bare path — e.g. `?phase=TWO&ramp=1`, or nothing.
 */
export function gameLink(base: string, phase: LabPhase, ramp: boolean): string {
  const params = new URLSearchParams()
  if (phase === 'TWO') params.set('phase', 'TWO')
  if (ramp) params.set('ramp', '1')
  const query = params.toString()
  return query ? `${base}?${query}` : base
}
