import { describe, expect, it } from 'vitest'
import { createSwarm, defaultTuning, scatterStarts, type SwarmTuning, type Vec } from '../swarm'

/** Deterministic rng so a tuning tweak that breaks convergence fails the same way twice. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const stage = { width: 1280, height: 800 }

/** The overlapping row: 48px circles, 8px overlap, centred on the stage. */
function rowTargets(n: number): Vec[] {
  const spacing = 40
  const left = stage.width / 2 - ((n - 1) * spacing) / 2
  return Array.from({ length: n }, (_, i) => ({ x: left + i * spacing, y: 120 }))
}

function run(tuning: SwarmTuning, seed: number, maxSeconds = 20) {
  const targets = rowTargets(9)
  const swarm = createSwarm({ targets, stage, tuning, rng: mulberry32(seed) })
  const dt = 1 / 60
  let seconds = 0
  while (!swarm.finished && seconds < maxSeconds) {
    swarm.step(dt)
    seconds += dt
  }
  return { swarm, targets, seconds }
}

describe('createSwarm', () => {
  it('settles every member exactly on its slot', () => {
    const { swarm, targets, seconds } = run(defaultTuning, 1)

    expect(swarm.finished).toBe(true)
    expect(seconds).toBeLessThan(defaultTuning.durationMs / 1000 + 5)
    expect(swarm.particles).toHaveLength(targets.length)
    for (const p of swarm.particles) {
      expect([p.x, p.y, p.tilt]).toEqual([p.tx, p.ty, 0])
    }
  })

  it('stays finite while the forces are still fighting', () => {
    const targets = rowTargets(9)
    const swarm = createSwarm({ targets, stage, tuning: defaultTuning, rng: mulberry32(7) })
    for (let i = 0; i < 120; i++) {
      swarm.step(1 / 60)
      for (const p of swarm.particles) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
        expect(Number.isFinite(p.vx) && Number.isFinite(p.vy)).toBe(true)
      }
    }
  })

  it('terminates even when tuned so it would never come to rest on its own', () => {
    // No damping, maximum bounce, permanent chaos: only the timeout can end this.
    const hostile: SwarmTuning = {
      ...defaultTuning,
      damping: 1,
      endDamping: 1,
      restitution: 1,
      chaos: 1500,
    }
    const { swarm } = run(hostile, 3)
    expect(swarm.finished).toBe(true)
  })

  it('never lets anyone leave the stage — this is what replaces the scroll lock', () => {
    // Swept over seeds rather than trusting one: a single lucky seed can hide a real violation.
    const targets = rowTargets(9)
    for (let seed = 0; seed < 20; seed++) {
      const swarm = createSwarm({ targets, stage, tuning: defaultTuning, rng: mulberry32(seed) })
      for (let i = 0; i < 400 && !swarm.finished; i++) {
        swarm.step(1 / 60)
        for (const p of swarm.particles) {
          expect(p.x).toBeGreaterThanOrEqual(defaultTuning.wallRadius)
          expect(p.x).toBeLessThanOrEqual(stage.width - defaultTuning.wallRadius)
          expect(p.y).toBeGreaterThanOrEqual(defaultTuning.wallRadius)
          expect(p.y).toBeLessThanOrEqual(stage.height - defaultTuning.wallRadius)
        }
      }
    }
  })

  it('still settles when a target sits outside the wall inset', () => {
    // The walls must widen to contain the targets, or the spring fights the clamp forever.
    const targets = [
      { x: 4, y: 4 },
      { x: stage.width - 4, y: stage.height - 4 },
    ]
    const swarm = createSwarm({ targets, stage, tuning: defaultTuning, rng: mulberry32(12) })
    let seconds = 0
    while (!swarm.finished && seconds < 20) {
      swarm.step(1 / 60)
      seconds += 1 / 60
    }
    expect(swarm.finished).toBe(true)
  })
})

describe('scatterStarts', () => {
  // The unevenness check below stays on this one fixed seed — it's a distribution property,
  // and averaging it over a sweep would weaken it.
  const starts = scatterStarts(stage, 9, defaultTuning.wallRadius, mulberry32(42))

  // Swept over seeds rather than trusting one: insetting only along the edge normal leaves the
  // tangential coordinate untouched, so a start projected near a corner can still be off the
  // *adjacent* edge. Seed 11 is the seed that surfaced this (see the regression test below).
  const sweepBatches = Array.from({ length: 20 }, (_, seed) =>
    scatterStarts(stage, 9, defaultTuning.wallRadius, mulberry32(seed)),
  )
  const sweepStarts = sweepBatches.flat()

  /** How far inside the stage border a point sits; negative would be outside. */
  function insideBy(s: Vec): number {
    return Math.min(s.x, stage.width - s.x, s.y, stage.height - s.y)
  }

  it('keeps every start fully inside the stage', () => {
    for (const s of sweepStarts)
      expect(insideBy(s)).toBeGreaterThanOrEqual(defaultTuning.wallRadius)
  })

  it('keeps the seed-11 start inside the stage', () => {
    // Regression case: before the tangential clamp, this seed's particle 4 landed at
    // x≈9.17, y≈46.08 — correctly inset from the top edge but ~15px off the left one. Named
    // explicitly so a future narrowing of the sweep above can't silently drop this seed.
    for (const s of scatterStarts(stage, 9, defaultTuning.wallRadius, mulberry32(11))) {
      expect(insideBy(s)).toBeGreaterThanOrEqual(defaultTuning.wallRadius)
    }
  })

  it('hugs the edges — nobody starts out in open space', () => {
    for (const s of sweepStarts) expect(insideBy(s)).toBeLessThan(defaultTuning.wallRadius + 46)
  })

  it('spreads them unevenly — no readable ring pattern', () => {
    const gaps = starts.map((s) =>
      Math.min(...starts.filter((o) => o !== s).map((o) => Math.hypot(o.x - s.x, o.y - s.y))),
    )
    // Evenly spaced starts would make every nearest-neighbour distance the same.
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.3)
  })
})
