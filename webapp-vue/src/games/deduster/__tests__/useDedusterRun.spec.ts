import { describe, expect, it } from 'vitest'
import { useDedusterRun, type RunClock, type RunResult } from '../useDedusterRun'

function fakeClock(paintDelayMs = 0) {
  let now = 0
  let jobs: { at: number; fn: () => void; cancelled: boolean }[] = []
  const clock: RunClock = {
    now: () => now,
    schedule(fn, delayMs) {
      const job = { at: now + delayMs, fn, cancelled: false }
      jobs.push(job)
      return () => {
        job.cancelled = true
      }
    },
    afterPaint(fn) {
      const job = { at: now + paintDelayMs, fn, cancelled: false }
      jobs.push(job)
    },
  }
  /** Moves time to [to], running every due job in time order — jobs may schedule further jobs. */
  function advanceTo(to: number): void {
    for (;;) {
      const due = jobs.filter((j) => !j.cancelled && j.at <= to).sort((a, b) => a.at - b.at)[0]
      if (due === undefined) break
      jobs = jobs.filter((j) => j !== due)
      now = due.at
      due.fn()
    }
    now = to
  }
  return { clock, advanceTo }
}

const ORDER = [5, 2, 0, 7] as const

function runWith(paintDelayMs = 0) {
  const { clock, advanceTo } = fakeClock(paintDelayMs)
  const ends: RunResult[] = []
  const run = useDedusterRun({ order: ORDER, intervalMs: 1000, clock, onEnd: (r) => ends.push(r) })
  return { run, advanceTo, ends }
}

describe('useDedusterRun', () => {
  it('ignores taps before tile 0 falls', () => {
    const { run, advanceTo } = runWith()
    run.start(1000)

    advanceTo(500)
    expect(run.tap(5)).toBe('ignored')
    expect(run.revealed.value).toBe(0)
  })

  it('drops a tile per beat and times each first hit from the paint', () => {
    const { run, advanceTo, ends } = runWith(16)
    run.start(1000)

    advanceTo(1316)
    expect(run.revealed.value).toBe(1)
    expect(run.tap(5)).toBe('hit')
    expect(run.tap(5)).toBe('hit')

    advanceTo(2400)
    expect(run.revealed.value).toBe(2)
    expect(run.tap(2)).toBe('hit')

    advanceTo(3200)
    run.tap(0)
    advanceTo(4500)
    run.tap(7)

    expect(ends).toEqual([
      { reactionsMs: [300, 384, 184, 484], endedBy: 'COMPLETE', wrongTileIndex: null },
    ])
    expect(run.ended.value).toBe(true)
  })

  it('ends too late when a beat passes without the hit', () => {
    const { run, advanceTo, ends } = runWith()
    run.start(1000)

    advanceTo(1200)
    run.tap(5)
    advanceTo(3000)

    expect(ends).toEqual([{ reactionsMs: [200], endedBy: 'TOO_LATE', wrongTileIndex: null }])
  })

  it('ends on a wrong tile, an earlier tile included', () => {
    const { run, advanceTo, ends } = runWith()
    run.start(1000)

    advanceTo(1200)
    run.tap(5)
    advanceTo(2100)
    expect(run.tap(5)).toBe('miss')

    expect(ends).toEqual([{ reactionsMs: [200], endedBy: 'WRONG_TILE', wrongTileIndex: 5 }])
    expect(run.tap(2)).toBe('ignored')
  })

  it('ends too late when abandoned, and only once', () => {
    const { run, advanceTo, ends } = runWith()
    run.start(1000)
    advanceTo(1200)
    run.tap(5)

    run.abandon()
    run.abandon()
    advanceTo(9000)

    expect(ends).toEqual([{ reactionsMs: [200], endedBy: 'TOO_LATE', wrongTileIndex: null }])
  })

  it('lets a late start fall at once and only stretches the first beat', () => {
    const { run, advanceTo, ends } = runWith()
    advanceTo(5000)
    run.start(1000)

    advanceTo(5000)
    expect(run.revealed.value).toBe(1)
    expect(ends).toEqual([])
    expect(run.ended.value).toBe(false)

    expect(run.tap(5)).toBe('hit')
    advanceTo(6000)
    expect(run.revealed.value).toBe(2)
    expect(ends).toEqual([])
    expect(run.tap(2)).toBe('hit')
  })
})
