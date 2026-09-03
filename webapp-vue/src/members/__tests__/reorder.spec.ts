import { describe, expect, it } from 'vitest'
import { planReorder, reorderTuning, RISER_SEEK, YIELD_SEEK } from '../reorder'
import { createSwarm } from '../swarm'
import type { Vec } from '../swarm'

/** The ranking, leader leftmost: rank i stands at x = 40·i. */
function row(ids: string[]): Map<string, Vec> {
  return new Map(ids.map((id, i) => [id, { x: 40 * i, y: 300 }]))
}

type Plan = NonNullable<ReturnType<typeof planReorder>>

function entryOf(plan: Plan, id: string) {
  return plan.entries.find((e) => e.id === id)!
}

function scaleOf(plan: Plan, id: string): number {
  return entryOf(plan, id).seekScale ?? 1
}

describe('planReorder', () => {
  it('has nothing to say when the order held', () => {
    const before = row(['a', 'b', 'c'])

    expect(planReorder({ before, after: row(['a', 'b', 'c']), meId: 'a' })).toBeNull()
  })

  it('sends everyone who changed place from where they stood to where they now stand', () => {
    const plan = planReorder({
      before: row(['a', 'b', 'c']),
      after: row(['b', 'a', 'c']),
      meId: 'z',
    })

    expect(plan).not.toBeNull()
    const a = entryOf(plan!, 'a')
    expect(a.start).toEqual({ x: 0, y: 300 })
    expect([a.x, a.y]).toEqual([40, 300])
    // c held its place: a particle either way, so it can be bumped, but with nowhere to go.
    const c = entryOf(plan!, 'c')
    expect(c.start).toEqual({ x: c.x, y: c.y })
  })

  it('gives my own rise a stiffer spring than the members it comes through', () => {
    // 'me' goes from rank 3 to rank 1; 'b' and 'c' are pushed back one each.
    const plan = planReorder({
      before: row(['a', 'b', 'c', 'me']),
      after: row(['a', 'me', 'b', 'c']),
      meId: 'me',
    })

    expect(plan!.riserId).toBe('me')
    expect(scaleOf(plan!, 'me')).toBe(RISER_SEEK)
    expect(scaleOf(plan!, 'b')).toBe(YIELD_SEEK)
    expect(scaleOf(plan!, 'c')).toBe(YIELD_SEEK)
    expect(RISER_SEEK).toBeGreaterThan(1)
    expect(YIELD_SEEK).toBeLessThan(1)
  })

  it('sends everyone who moves out of the line — forward over the top, backward underneath', () => {
    // The row is one line, and two bodies on one line cannot pass each other: contact resolution
    // turns every overtaking into a jam, both of them pushing until the movement times out. So
    // whoever travels leaves the line, and the two directions leave it opposite ways.
    const plan = planReorder({
      before: row(['a', 'b', 'c']),
      after: row(['b', 'a', 'c']),
      meId: 'z',
    })

    expect(entryOf(plan!, 'b').detour!.y).toBeLessThan(0)
    expect(entryOf(plan!, 'a').detour!.y).toBeGreaterThan(0)
    // c held its place and has nobody to get past.
    expect(entryOf(plan!, 'c').detour).toBeUndefined()
  })

  it('lifts my own rise clear of the members stepping aside for it', () => {
    const plan = planReorder({
      before: row(['a', 'b', 'c', 'me']),
      after: row(['a', 'me', 'b', 'c']),
      meId: 'me',
    })

    expect(entryOf(plan!, 'me').detour!.y).toBeLessThan(entryOf(plan!, 'b').detour!.y)
  })

  it('lets a rise that is not mine simply glide', () => {
    // Under CLOSEST_ONLY a later, better guess moves someone else's points while I did nothing.
    const plan = planReorder({
      before: row(['a', 'b', 'c']),
      after: row(['c', 'a', 'b']),
      meId: 'a',
    })

    expect(plan!.riserId).toBeNull()
    expect(plan!.entries.map((e) => e.seekScale ?? 1)).toEqual([1, 1, 1])
  })

  it('does not box its way down when I lost places', () => {
    const plan = planReorder({
      before: row(['me', 'a', 'b']),
      after: row(['a', 'b', 'me']),
      meId: 'me',
    })

    expect(plan!.riserId).toBeNull()
  })

  it('makes only the members I move through yield, not a rearrangement elsewhere', () => {
    // 'me' rises past 'c' at the front; 'x' and 'y' swap far behind me and have nothing to yield to.
    const plan = planReorder({
      before: row(['c', 'me', 'x', 'y']),
      after: row(['me', 'c', 'y', 'x']),
      meId: 'me',
    })

    expect(scaleOf(plan!, 'c')).toBe(YIELD_SEEK)
    expect(scaleOf(plan!, 'x')).toBe(1)
    expect(scaleOf(plan!, 'y')).toBe(1)
  })

  it('lifts everyone who moves, and nobody who does not', () => {
    // Whoever moves has to pass over the members standing still, not under them.
    const plan = planReorder({
      before: row(['a', 'b', 'c']),
      after: row(['b', 'a', 'c']),
      meId: 'q',
    })

    expect([...plan!.moving].sort()).toEqual(['a', 'b'])
  })

  it('leaves a member who just joined standing where they are', () => {
    // No before-position to fly from, and a fly-in belongs to entering the community.
    const plan = planReorder({
      before: row(['a', 'b']),
      after: row(['a', 'newcomer', 'b']),
      meId: 'a',
    })

    const newcomer = entryOf(plan!, 'newcomer')
    expect(newcomer.start).toEqual({ x: newcomer.x, y: newcomer.y })
    expect(plan!.moving.has('newcomer')).toBe(false)
  })

  describe('driven through the real swarm', () => {
    /** Every shape of rearrangement, run to a standstill with the real tuning. */
    function secondsToRest(before: string[], after: string[], meId?: string): number {
      const plan = planReorder({ before: row(before), after: row(after), meId })!
      const swarm = createSwarm({
        targets: plan.entries,
        stage: { width: 390, height: 844 },
        tuning: reorderTuning,
      })
      let seconds = 0
      while (!swarm.finished && seconds < 10) {
        swarm.step(1 / 60)
        seconds += 1 / 60
      }
      return seconds
    }

    // The failure this guards against does not look like a wrong number, it looks like a frozen
    // row: two members who have to trade places push against each other, neither gets through, and
    // the swarm only ends on its bail-out timeout — seconds later, with a snap. It is what happens
    // to *every* rearrangement the moment the detours are tuned away.
    const TEN = ['a', 'b', 'c', 'd', 'e', 'me', 'g', 'h', 'i', 'j']
    const budget = reorderTuning.durationMs / 1000 + 1

    it('gets a rise of three places home well inside the budget', () => {
      const after = ['a', 'b', 'me', 'c', 'd', 'e', 'g', 'h', 'i', 'j']
      expect(secondsToRest(TEN, after, 'me')).toBeLessThan(budget)
    })

    it('gets a rise all the way to the front home well inside the budget', () => {
      const after = ['me', 'a', 'b', 'c', 'd', 'e', 'g', 'h', 'i', 'j']
      expect(secondsToRest(TEN, after, 'me')).toBeLessThan(budget)
    })

    it('gets two strangers trading places home well inside the budget', () => {
      // Nobody's own rise, so nothing is boxing — and still two bodies that have to pass.
      const after = ['a', 'b', 'd', 'c', 'e', 'me', 'g', 'h', 'i', 'j']
      expect(secondsToRest(TEN, after, 'me')).toBeLessThan(budget)
    })
  })

  it('drops a member who is gone rather than animating a ghost', () => {
    const plan = planReorder({
      before: row(['a', 'gone', 'b']),
      after: row(['a', 'b']),
      meId: 'a',
    })

    expect(plan!.entries.map((e) => e.id)).not.toContain('gone')
  })
})
