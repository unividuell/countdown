/**
 * What happens to the ranking row when a guess has moved the standings: who has to travel, who
 * has to get out of the way, and how hard each of them pulls. Pure geometry — the caller measures
 * the row and hands in two sets of centres, this decides the choreography and nothing else.
 *
 * Two numbers tell the whole story. `detour` sends everyone who travels out of the line for the
 * length of the journey — forward over the top, backward underneath — because a row of avatars is
 * a single line, and two bodies on one line cannot pass each other: with everybody kept in it, an
 * overtaking is a jam, all of them pushing and nobody arriving. `seekScale` then gives the viewer's
 * own riser a spring stiff enough to arrive while the members it overtakes are still on their way,
 * so it meets them rather than following them, and a detour high enough to come down on top of
 * them. The shoving itself is scripted nowhere: it is the swarm's ordinary contact resolution,
 * meeting bodies that happen to still be in the way.
 */
import type { SwarmTarget, SwarmTuning, Vec } from './swarm'

/**
 * Short and crisp, unlike the entrance: this is a correction to a row that already stands, and
 * the reader is in the middle of reading a result off it. No cohesion and no chaos — every
 * deviation from a straight line here should come from somebody actually being in the way.
 */
export const reorderTuning: SwarmTuning = {
  durationMs: 650,
  seekStrength: 220,
  // Barely a ramp: the entrance dawdles before it collapses, a rearrangement sets off at once.
  seekRamp: 1.2,
  cohesion: 0,
  cohesionFade: 1,
  neighborRadius: 0,
  contactRadius: 19,
  restitution: 0.5,
  damping: 0.94,
  endDamping: 0.7,
  chaos: 0,
  tilt: 0.012,
  maxSpeed: 1600,
  wallRadius: 24,
}

/** The riser's spring: stiff enough to catch up with the members it is overtaking. */
export const RISER_SEEK = 1.8
/** And theirs: slack enough to still be in its way when it gets there. */
export const YIELD_SEEK = 0.55
/**
 * How far a travelling member is sent out of the line halfway through, in px. Whoever moves
 * forward goes over the top (negative is upwards), whoever gives way ducks underneath, so two
 * members trading places never meet head-on. Small: enough to get past, not a hop.
 */
export const GLIDE_LIFT = 8
/**
 * And how far the viewer's own riser climbs — clear of the members stepping aside, so it arrives
 * over them rather than between them. Measured, it swings ~39px at the peak: the spring chases a
 * bulge that is already closing again, and overshoots it.
 */
export const RISER_LIFT = -16

/** Below this, a measured difference is layout noise rather than a member who moved. */
const MOVED_EPS = 0.5

export interface ReorderInput {
  /** Circle centres before the update, by member id; a member missing here is new to the row. */
  before: Map<string, Vec>
  /** Circle centres now — the order the swarm has to arrive at. */
  after: Map<string, Vec>
  /** The viewer, when known. Only their own rise is worth boxing for. */
  meId?: string | undefined
}

/** One member's journey — a swarm target that still knows whose it is. */
export interface ReorderEntry extends SwarmTarget {
  id: string
  start: Vec
}

export interface ReorderPlan {
  /** In particle order, ready to be handed to `createSwarm` as its targets. */
  entries: ReorderEntry[]
  /** Who travels — and therefore has to pass over the members standing still, not under them. */
  moving: Set<string>
  /** The viewer's own rise, if this is one. */
  riserId: string | null
}

/** Null when nobody's place changed: new points alone are the badge's business, not the row's. */
export function planReorder({ before, after, meId }: ReorderInput): ReorderPlan | null {
  const moving = new Set<string>()
  const entries: ReorderEntry[] = [...after].map(([id, target]) => {
    // A member who was not there before has no place to travel from, and inventing one would be a
    // second entrance. They stand still — but as a particle, so a riser can still bump into them.
    const start = before.get(id) ?? target
    if (Math.hypot(target.x - start.x, target.y - start.y) > MOVED_EPS) moving.add(id)
    return { id, x: target.x, y: target.y, start }
  })
  if (moving.size === 0) return null

  for (const e of entries) {
    if (moving.has(e.id)) e.detour = { x: 0, y: e.x < e.start.x ? -GLIDE_LIFT : GLIDE_LIFT }
  }

  const riserId = findRiser(before, after, moving, meId)
  const riser = entries.find((e) => e.id === riserId)
  if (riser) {
    riser.seekScale = RISER_SEEK
    riser.detour = { x: 0, y: RISER_LIFT }
    const span = { from: riser.x, to: riser.start.x }
    for (const e of entries) {
      // Only the stretch the riser travels through yields. Someone rearranging elsewhere in the row
      // has nobody to make way for, and slowing them down would read as a second, sluggish event.
      if (e !== riser && moving.has(e.id) && withinSpan(e.start.x, span)) e.seekScale = YIELD_SEEK
    }
  }

  return { entries, moving, riserId }
}

/**
 * Leftwards is forwards: the row is the ranking, leader first. A viewer who *lost* places is
 * carried along by whoever passed them — being shoved is the other half of the same story, and
 * boxing one's way backwards would tell it wrong.
 */
function findRiser(
  before: Map<string, Vec>,
  after: Map<string, Vec>,
  moving: Set<string>,
  meId: string | undefined,
): string | null {
  if (!meId || !moving.has(meId)) return null
  const from = before.get(meId)
  const to = after.get(meId)
  if (!from || !to) return null
  return to.x < from.x - MOVED_EPS ? meId : null
}

function withinSpan(x: number, span: { from: number; to: number }): boolean {
  return (
    x >= Math.min(span.from, span.to) - MOVED_EPS && x <= Math.max(span.from, span.to) + MOVED_EPS
  )
}
