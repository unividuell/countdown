/**
 * A tiny force-based swarm: every member is a particle that drifts in from the edge of the
 * screen, clumps up with whoever happens to be nearby, and is eventually yanked into its
 * slot in the ranking row. Pure TypeScript, no DOM — the component only reads positions out.
 *
 * All coordinates are viewport pixels. Force constants marked "spring" are in 1/s² (they
 * multiply a distance to yield an acceleration), so `omega = sqrt(k)` predicts how fast a
 * particle whips into place.
 */

export interface Vec {
  x: number
  y: number
}

export interface SwarmTuning {
  /** Time budget for the flight. The ramps below are expressed over this span. */
  durationMs: number
  /** Peak spring constant pulling a particle to its slot. */
  seekStrength: number
  /** Exponent of the seek ramp. >1 means "dawdle first, then hurry". */
  seekRamp: number
  /** Peak spring constant pulling a particle to its neighbours' centroid. */
  cohesion: number
  /** Exponent of the cohesion fade-out. Higher = packs dissolve sooner. */
  cohesionFade: number
  /** How far a particle looks for pack mates, in px. */
  neighborRadius: number
  /**
   * Collision radius, in px. Must stay below half the final centre spacing (40px for the
   * overlapping row), otherwise particles can never reach their resting places.
   */
  contactRadius: number
  /** Bounciness of a particle-particle hit, 0 = dead, 1 = perfectly elastic. */
  restitution: number
  /** Velocity retention per 60fps frame at t=0 (near 1 = almost free flight). */
  damping: number
  /** Velocity retention per 60fps frame at t=1 (lower = settles harder). */
  endDamping: number
  /** Peak wander acceleration in px/s², faded out as the flight progresses. */
  chaos: number
  /** Degrees of banking per px/s of horizontal speed. 0 disables the tilt. */
  tilt: number
  /** Speed clamp in px/s, so a late overshoot cannot fling anyone into orbit. */
  maxSpeed: number
  /**
   * Distance kept clear of the stage edge, in px — the *visual* circle radius, not the collision
   * one, because what must not overflow is the painted circle.
   */
  wallRadius: number
}

export const defaultTuning: SwarmTuning = {
  durationMs: 2600,
  seekStrength: 130,
  seekRamp: 3,
  cohesion: 9,
  // Cohesion and chaos must be gone well before the spring peaks: while they last, they
  // hold the swarm in an equilibrium that swallows the overshoot and the arrival reads
  // as a slow mushy drift instead of an impact.
  cohesionFade: 3,
  // Deliberately smaller than the finished row (~360px wide): a radius that spans the
  // whole row makes one blob around a single centroid, not travelling packs.
  neighborRadius: 220,
  contactRadius: 19,
  restitution: 0.62,
  damping: 0.995,
  endDamping: 0.83,
  chaos: 380,
  tilt: 0.02,
  maxSpeed: 1600,
  wallRadius: 24,
}

export interface SwarmParticle {
  x: number
  y: number
  vx: number
  vy: number
  /** Resting place. Carried on the particle so consumers never zip two arrays. */
  tx: number
  ty: number
  /** Banking angle in degrees, derived from horizontal speed. */
  tilt: number
  /** Wander heading, random-walked so the drift curves instead of jittering. */
  wander: number
}

export interface Swarm {
  readonly particles: readonly SwarmParticle[]
  readonly finished: boolean
  /** Advance by `dt` seconds of wall time, internally split into fixed substeps. */
  step(dt: number): void
}

export interface SwarmOptions {
  /** Resting centre of each member, in viewport coordinates. */
  targets: Vec[]
  stage: { width: number; height: number }
  tuning: SwarmTuning
  rng?: () => number
}

const TAU = Math.PI * 2
// Fixed substep: collisions plus a stiff late spring are unstable at raw frame times.
const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 12
const MAX_TILT_DEG = 18
const WANDER_TURN = 9 // rad/s of random walk on the wander heading
// Bail-out after the time budget so a hostile tuning cannot leave the swarm jittering forever.
const SETTLE_TIMEOUT_S = 4
const SETTLE_DIST = 0.35 // px
const SETTLE_SPEED = 4 // px/s

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * How far inside the edge a start sits, measured from the circle's centre. The floor is a circle
 * radius, so the whole circle is always on screen: a transformed element enlarges its ancestors'
 * scrollable area, and staying inside is what removes the need to lock scrolling at all.
 */
const INSET_MIN = 24
const INSET_RANGE = 46

/**
 * Insetting along the edge normal moves only one axis, so a start projected near a corner is
 * still hard against the adjacent edge — and its painted circle hangs off-screen, which is the
 * very thing the walls exist to prevent. The upper bound is floored at [INSET_MIN] so a stage
 * narrower than twice the inset degenerates instead of inverting.
 */
function clampInside(value: number, extent: number): number {
  return Math.min(Math.max(value, INSET_MIN), Math.max(INSET_MIN, extent - INSET_MIN))
}

/**
 * Places `count` particles along the **inside** of the stage edges, spread around them but
 * deliberately not evenly: strata are sampled with jitter wider than the strata themselves, so
 * neighbours bunch up and gaps open. Each start also gets its own inset, so nobody lines up.
 */
export function scatterStarts(
  stage: { width: number; height: number },
  count: number,
  rng: () => number,
): Vec[] {
  const rot = rng()
  const out: Vec[] = []
  for (let i = 0; i < count; i++) {
    const stratum = (i + 0.5) / count
    // 1.7 strata of jitter: overlapping ranges are what breaks up the ring pattern.
    const jitter = (rng() - 0.5) * (1.7 / count)
    const u = (stratum + jitter + rot + 1) % 1
    const { p, n } = pointOnRectPerimeter(stage.width, stage.height, u)
    const inset = INSET_MIN + rng() * INSET_RANGE
    out.push({
      x: clampInside(p.x - n.x * inset, stage.width),
      y: clampInside(p.y - n.y * inset, stage.height),
    })
  }
  return out
}

/**
 * Maps u ∈ [0,1) to a point on the rect border, walked by arc length from the top-left,
 * together with that edge's outward normal.
 */
function pointOnRectPerimeter(width: number, height: number, u: number): { p: Vec; n: Vec } {
  let d = u * 2 * (width + height)
  if (d < width) return { p: { x: d, y: 0 }, n: { x: 0, y: -1 } }
  d -= width
  if (d < height) return { p: { x: width, y: d }, n: { x: 1, y: 0 } }
  d -= height
  if (d < width) return { p: { x: width - d, y: height }, n: { x: 0, y: 1 } }
  d -= width
  return { p: { x: 0, y: height - d }, n: { x: -1, y: 0 } }
}

export function createSwarm({ targets, stage, tuning, rng = Math.random }: SwarmOptions): Swarm {
  const starts = scatterStarts(stage, targets.length, rng)
  // Widened to contain every target: a target outside the inset would leave the spring fighting
  // the clamp forever, and the swarm would never come to rest.
  const xs = targets.map((t) => t.x)
  const ys = targets.map((t) => t.y)
  const walls = {
    minX: Math.min(tuning.wallRadius, ...xs),
    maxX: Math.max(stage.width - tuning.wallRadius, ...xs),
    minY: Math.min(tuning.wallRadius, ...ys),
    maxY: Math.max(stage.height - tuning.wallRadius, ...ys),
  }
  const particles: SwarmParticle[] = targets.map((target, i) => {
    const s = starts[i] ?? target
    // Barely moving at first — the acceleration has to be visibly earned.
    const a = rng() * TAU
    const speed = rng() * 30
    return {
      x: s.x,
      y: s.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      tx: target.x,
      ty: target.y,
      tilt: 0,
      wander: rng() * TAU,
    }
  })

  let elapsed = 0
  let carry = 0
  let finished = false

  function snap(): void {
    for (const p of particles) {
      p.x = p.tx
      p.y = p.ty
      p.vx = 0
      p.vy = 0
      p.tilt = 0
    }
    finished = true
  }

  function substep(dt: number): void {
    elapsed += dt
    const t = Math.min(1, elapsed / (tuning.durationMs / 1000))
    const seekK = tuning.seekStrength * Math.pow(t, tuning.seekRamp)
    const cohesionK = tuning.cohesion * Math.pow(1 - t, tuning.cohesionFade)
    const chaosK = tuning.chaos * Math.pow(1 - t, 2)
    const retention = Math.pow(lerp(tuning.damping, tuning.endDamping, Math.pow(t, 1.6)), dt * 60)
    const neighborR2 = tuning.neighborRadius * tuning.neighborRadius

    for (const p of particles) {
      let ax = (p.tx - p.x) * seekK
      let ay = (p.ty - p.y) * seekK

      if (cohesionK > 0) {
        let sx = 0
        let sy = 0
        let n = 0
        for (const q of particles) {
          if (q === p) continue
          const dx = q.x - p.x
          const dy = q.y - p.y
          if (dx * dx + dy * dy < neighborR2) {
            sx += q.x
            sy += q.y
            n++
          }
        }
        if (n > 0) {
          ax += (sx / n - p.x) * cohesionK
          ay += (sy / n - p.y) * cohesionK
        }
      }

      p.wander += (rng() - 0.5) * WANDER_TURN * dt
      ax += Math.cos(p.wander) * chaosK
      ay += Math.sin(p.wander) * chaosK

      p.vx = (p.vx + ax * dt) * retention
      p.vy = (p.vy + ay * dt) * retention

      const speed = Math.hypot(p.vx, p.vy)
      if (speed > tuning.maxSpeed) {
        const k = tuning.maxSpeed / speed
        p.vx *= k
        p.vy *= k
      }

      p.x += p.vx * dt
      p.y += p.vy * dt
      p.tilt = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, p.vx * tuning.tilt))
    }

    resolveCollisions()
    bounceOffWalls()
  }

  function bounceOffWalls(): void {
    for (const p of particles) {
      if (p.x < walls.minX) {
        p.x = walls.minX
        if (p.vx < 0) p.vx = -p.vx * tuning.restitution
      } else if (p.x > walls.maxX) {
        p.x = walls.maxX
        if (p.vx > 0) p.vx = -p.vx * tuning.restitution
      }
      if (p.y < walls.minY) {
        p.y = walls.minY
        if (p.vy < 0) p.vy = -p.vy * tuning.restitution
      } else if (p.y > walls.maxY) {
        p.y = walls.maxY
        if (p.vy > 0) p.vy = -p.vy * tuning.restitution
      }
    }
  }

  function resolveCollisions(): void {
    const minD = tuning.contactRadius * 2
    if (minD <= 0) return
    const minD2 = minD * minD
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i]
      if (!a) continue
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j]
        if (!b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d2 = dx * dx + dy * dy
        if (d2 >= minD2 || d2 < 1e-9) continue
        const d = Math.sqrt(d2)
        const nx = dx / d
        const ny = dy / d
        const overlap = (minD - d) * 0.5
        a.x -= nx * overlap
        a.y -= ny * overlap
        b.x += nx * overlap
        b.y += ny * overlap
        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
        if (rvn >= 0) continue // already separating
        const impulse = (-(1 + tuning.restitution) * rvn) / 2 // equal masses
        a.vx -= impulse * nx
        a.vy -= impulse * ny
        b.vx += impulse * nx
        b.vy += impulse * ny
      }
    }
  }

  function atRest(): boolean {
    for (const p of particles) {
      if (Math.hypot(p.x - p.tx, p.y - p.ty) > SETTLE_DIST) return false
      if (Math.hypot(p.vx, p.vy) > SETTLE_SPEED) return false
    }
    return true
  }

  return {
    particles,
    get finished() {
      return finished
    },
    step(dt: number) {
      if (finished) return
      carry += Math.min(dt, MAX_SUBSTEPS * FIXED_DT)
      while (carry >= FIXED_DT) {
        carry -= FIXED_DT
        substep(FIXED_DT)
      }
      const budget = tuning.durationMs / 1000
      if ((elapsed >= budget && atRest()) || elapsed > budget + SETTLE_TIMEOUT_S) snap()
    },
  }
}
