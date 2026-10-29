/**
 * What a tap on the field does follows from where the round stands — there are no mode buttons.
 * Pure: the board passes the clock and the server's answers in, and acts on the effect it gets.
 *
 *   closed ─unlocked─▶ pinging ─tap─▶ loading ─landed─▶ wave ─settle─▶ pinging …
 *                         ▲  ping        │                taps mark       │ no pings left
 *                         └───refused────┘                rings          ▼
 *                                                                      pinning  taps set / lift pins
 *
 *   pinging, pinning ─locked─▶ closed
 *
 * A tap on `closed` only asks to unlock. The field opens once the sound runs and closes once it
 * stops — never while a ping is out or its wave runs.
 *
 * `waves[i]` is the i-th ping; `rings[i]` the radii marked around it, so the two stay aligned.
 */
import type { EchoDraft } from './draft'
import { ringRadius } from './sonar'
import type { EchoLocateGuess, Point } from './types'

/** `startMs` and `endMs` are `null` for a ping the server knows but this device never heard. */
export interface Wave {
  at: Point
  startMs: number | null
  endMs: number | null
}

export type FlowPhase = 'closed' | 'pinging' | 'loading' | 'wave' | 'pinning'

export interface FlowState {
  phase: FlowPhase
  clips: number
  /** How many pings the round allows; `waves.length` of them are spent. */
  pings: number
  waves: Wave[]
  rings: number[][]
  pins: Point[]
  /** Where the open ping was tapped, while its answer is out. */
  pending: Point | null
}

export type Effect = { kind: 'unlock' } | { kind: 'ping'; stage: number; at: Point } | null

/** A tap nearer than this to a pin lifts it, in cells. */
export const LIFT_RADIUS = 1.2

export function initialFlow(input: {
  clips: number
  pings: number
  steps: readonly Point[]
  draft: EchoDraft | null
}): FlowState {
  const waves = input.steps.map((at) => ({ at, startMs: null, endMs: null }))

  return {
    phase: 'closed',
    clips: input.clips,
    pings: input.pings,
    waves,
    // Rings only for pings the server still has; a wave without marks has none.
    rings: waves.map((_, ping) => input.draft?.rings[ping] ?? []),
    // Pins come after the last ping, so a draft with pins and pings left is stale.
    pins: waves.length >= input.pings ? (input.draft?.pins ?? []) : [],
    pending: null,
  }
}

/** Where a tap leads once no wave is running: the next ping, or the pins after the last. */
function idle(state: FlowState): FlowPhase {
  return state.waves.length < state.pings ? 'pinging' : 'pinning'
}

/** The sound runs: the cover goes, and the round goes on where it stood. */
export function unlocked(state: FlowState): FlowState {
  return state.phase === 'closed' ? { ...state, phase: idle(state) } : state
}

/** The sound stopped: back under the cover, pings, rings and pins kept. */
export function locked(state: FlowState): FlowState {
  return state.phase === 'pinging' || state.phase === 'pinning'
    ? { ...state, phase: 'closed' }
    : state
}

/**
 * `tMs` is the tap's `event.timeStamp`, the same timeline as the wave's start. The wave is
 * settled first: a tap after its end is the next ping or pin, never a ring.
 */
export function tap(
  state: FlowState,
  at: Point,
  tMs: number,
  speed: number,
): { state: FlowState; effect: Effect } {
  const now = settle(state, tMs)

  switch (now.phase) {
    case 'closed':
      return { state: now, effect: { kind: 'unlock' } }
    case 'pinging':
      return ping(now, at)
    case 'wave':
      return { state: mark(now, tMs, speed), effect: null }
    case 'pinning':
      return { state: pin(now, at), effect: null }
    case 'loading':
      return { state: now, effect: null }
  }
}

/** The ping counts as spent right here, before its answer — the server counts it on arrival. */
function ping(state: FlowState, at: Point): { state: FlowState; effect: Effect } {
  return {
    state: {
      ...state,
      phase: 'loading',
      waves: [...state.waves, { at, startMs: null, endMs: null }],
      rings: [...state.rings, []],
      pending: at,
    },
    effect: { kind: 'ping', stage: state.waves.length, at },
  }
}

/**
 * A ring around the running wave, up to one per clip. The wave has not ended (`tap` settled
 * first), so the radius stays within what `speed × (endMs − startMs)` allows.
 */
function mark(state: FlowState, tMs: number, speed: number): FlowState {
  const current = state.waves.length - 1
  const wave = state.waves[current]
  const marks = state.rings[current]
  if (wave === undefined || wave.startMs === null || marks === undefined) return state
  if (marks.length >= state.clips) return state

  const radius = ringRadius(wave.startMs, tMs, speed)
  if (radius === null) return state

  return {
    ...state,
    rings: state.rings.map((ring, ping) => (ping === current ? [...ring, radius] : ring)),
  }
}

/** Tapping near pins lifts the nearest; elsewhere a new one goes down, up to one per clip. */
function pin(state: FlowState, at: Point): FlowState {
  let near = -1
  let nearest = LIFT_RADIUS
  state.pins.forEach((p, i) => {
    const distance = Math.hypot(p.x - at.x, p.y - at.y)
    if (distance < nearest) {
      near = i
      nearest = distance
    }
  })
  if (near >= 0) return { ...state, pins: state.pins.filter((_, i) => i !== near) }

  return state.pins.length < state.clips ? { ...state, pins: [...state.pins, at] } : state
}

/** The answer to the open ping is in: its wave starts, `startMs` already after audio latency. */
export function landed(state: FlowState, startMs: number, endMs: number): FlowState {
  if (state.phase !== 'loading') return state

  const open = state.waves.length - 1

  return {
    ...state,
    phase: 'wave',
    waves: state.waves.map((wave, ping) => (ping === open ? { ...wave, startMs, endMs } : wave)),
    pending: null,
  }
}

/** The open ping never got through, so it is not spent. */
export function refused(state: FlowState): FlowState {
  if (state.phase !== 'loading') return state

  return {
    ...state,
    phase: 'pinging',
    waves: state.waves.slice(0, -1),
    rings: state.rings.slice(0, -1),
    pending: null,
  }
}

/**
 * Pings the server counted that this device did not run — an answer that never arrived. They
 * join without a wave. Not while a ping is open or a wave runs: that wave is the last one.
 */
export function synced(state: FlowState, steps: readonly Point[]): FlowState {
  if (state.phase === 'loading' || state.phase === 'wave') return state
  if (steps.length <= state.waves.length) return state

  const unknown = steps.slice(state.waves.length)
  const next = {
    ...state,
    waves: [...state.waves, ...unknown.map((at) => ({ at, startMs: null, endMs: null }))],
    rings: [...state.rings, ...unknown.map(() => [])],
  }

  return next.phase === 'pinging' ? { ...next, phase: idle(next) } : next
}

/** Ends the wave once its sound and sonar are over; the board calls it from a timer. */
export function settle(state: FlowState, nowMs: number): FlowState {
  if (state.phase !== 'wave') return state

  const endMs = state.waves[state.waves.length - 1]?.endMs ?? null

  return endMs !== null && nowMs >= endMs ? { ...state, phase: idle(state) } : state
}

/** What a tap does right now, as the line under the field says it. */
export function statusLine(state: FlowState): string {
  switch (state.phase) {
    case 'closed':
      return 'Antippen zum Starten'
    case 'loading':
      return 'Sonar lädt …'
    case 'pinging':
      return `Ping + Markieren · noch ${state.pings - state.waves.length}`
    case 'wave':
      return 'Markieren'
    case 'pinning':
      return `Schätzung · Pins ${state.pins.length}/${state.clips}`
  }
}

/** What the player hands in; `null` until every clip has its pin. */
export function guessOf(state: FlowState): EchoLocateGuess | null {
  if (state.pins.length !== state.clips) return null

  return { pins: [...state.pins], rings: state.rings.map((ring) => [...ring]) }
}
