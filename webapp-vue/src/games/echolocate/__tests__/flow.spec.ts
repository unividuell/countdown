import { describe, expect, it } from 'vitest'
import {
  clearRings,
  guessOf,
  hold,
  initialFlow,
  landed,
  LIFT_RADIUS,
  pingsLeft,
  refused,
  settle,
  statusLine,
  synced,
  tap,
} from '@/games/echolocate/flow'
import type { FlowState } from '@/games/echolocate/flow'
import type { Point } from '@/games/echolocate/types'

const SPEED = 3
const FIELD: Point = { x: 10, y: 10 }

function fresh(options: { clips?: number; pings?: number } = {}): FlowState {
  return initialFlow({
    clips: options.clips ?? 1,
    pings: options.pings ?? 3,
    steps: [],
    draft: null,
  })
}

/** A ping at `at` whose wave runs from `startMs` to `endMs`. */
function pinged(state: FlowState, at: Point, startMs: number, endMs: number): FlowState {
  return landed(tap(state, at, startMs - 100, SPEED).state, startMs, endMs)
}

/** `count` pings, each wave over before the next click. */
function spent(count: number, clips = 1): FlowState {
  let state = fresh({ clips, pings: count })

  for (let i = 0; i < count; i++) {
    state = pinged(state, { x: 4 + i, y: 4 }, 1000 + i * 10_000, 6000 + i * 10_000)
  }

  return settle(state, 100_000)
}

describe('tap — the short click', () => {
  // No cover: the field is open from the start, and the first click is the first ping.
  it('pings at its spot from the very first click and counts the ping at once', () => {
    const result = tap(fresh(), FIELD, 500, SPEED)

    expect(result.effect).toEqual({ kind: 'ping', stage: 0, at: FIELD })
    expect(result.state.phase).toBe('loading')
    expect(result.state.waves).toEqual([{ at: FIELD, startMs: null, endMs: null }])
    expect(result.state.rings).toEqual([[]])
    expect(result.state.pending).toEqual(FIELD)
  })

  it('ignores clicks while the sonar loads', () => {
    const loading = tap(fresh(), FIELD, 500, SPEED).state
    const result = tap(loading, { x: 1, y: 1 }, 600, SPEED)

    expect(result.state).toBe(loading)
    expect(result.effect).toBeNull()
  })

  it('marks rings during the wave, at most clips of them', () => {
    const wave = pinged(fresh({ clips: 2 }), FIELD, 1000, 9000)

    const one = tap(wave, { x: 1, y: 1 }, 2000, SPEED).state
    const two = tap(one, { x: 1, y: 1 }, 3000, SPEED).state
    const three = tap(two, { x: 1, y: 1 }, 4000, SPEED)

    expect(two.rings).toEqual([[3, 6]])
    expect(three.state.rings).toEqual([[3, 6]])
    expect(three.effect).toBeNull()
  })

  it('records no ring at or after the end of the wave: that click is the next ping', () => {
    const wave = pinged(fresh(), FIELD, 1000, 9000)
    const at = { x: 15, y: 5 }
    const result = tap(wave, at, 9000, SPEED)

    expect(result.effect).toEqual({ kind: 'ping', stage: 1, at })
    expect(result.state.rings).toEqual([[], []])
  })

  it('pings no further once every ping is spent', () => {
    const state = spent(3)
    const result = tap(state, FIELD, 200_000, SPEED)

    expect(pingsLeft(state)).toBe(false)
    expect(result.effect).toBeNull()
    expect(result.state).toEqual(state)
  })
})

describe('hold — the long click', () => {
  it('sets a pin wherever the round stands: idle, loading or in a wave', () => {
    const idle = hold(fresh(), { x: 7, y: 8 })
    const loading = hold(tap(fresh(), FIELD, 500, SPEED).state, { x: 7, y: 8 })
    const wave = hold(pinged(fresh(), FIELD, 1000, 9000), { x: 7, y: 8 })

    for (const state of [idle, loading, wave]) expect(state.pins).toEqual([{ x: 7, y: 8 }])
    expect(wave.phase).toBe('wave')
  })

  it('lifts a pin by holding on it, sets none beyond clips', () => {
    const placed = hold(fresh({ clips: 2 }), { x: 5, y: 5 })

    // inside the lift radius: the pin goes
    expect(hold(placed, { x: 5 + LIFT_RADIUS - 0.01, y: 5 }).pins).toEqual([])

    // exactly on the radius: not near enough, a second pin goes down
    const second = hold(placed, { x: 5 + LIFT_RADIUS, y: 5 })
    expect(second.pins).toHaveLength(2)

    // clips is 2: a third hold away from both pins does nothing
    expect(hold(second, { x: 15, y: 15 }).pins).toEqual(second.pins)
  })

  it('lifts the nearest pin when two are in reach', () => {
    const both = hold(hold(fresh({ clips: 2 }), { x: 5, y: 5 }), { x: 6.3, y: 5 })

    // 0.8 from the first, 0.5 from the second
    expect(hold(both, { x: 5.8, y: 5 }).pins).toEqual([{ x: 5, y: 5 }])
  })
})

describe('clearRings', () => {
  it('clears the rings and keeps pins and pings, one empty list per ping', () => {
    let state = pinged(fresh({ clips: 2 }), { x: 4, y: 4 }, 1000, 9000)
    state = tap(state, FIELD, 2000, SPEED).state
    state = hold(settle(state, 9000), { x: 5, y: 5 })

    const cleared = clearRings(state)

    expect(cleared.rings).toEqual([[]])
    expect(cleared.pins).toEqual([{ x: 5, y: 5 }])
    expect(cleared.waves).toEqual(state.waves)
  })

  it('works during a wave too, and the wave may be marked again', () => {
    let state = pinged(fresh(), FIELD, 1000, 9000)
    state = tap(state, FIELD, 2000, SPEED).state
    state = clearRings(state)

    expect(state.rings).toEqual([[]])
    expect(tap(state, FIELD, 4000, SPEED).state.rings).toEqual([[9]])
  })

  it('marks the next wave at its own ping', () => {
    let state = pinged(fresh(), { x: 4, y: 4 }, 1000, 9000)
    state = tap(state, FIELD, 2000, SPEED).state
    state = clearRings(settle(state, 9000))
    state = pinged(state, { x: 12, y: 12 }, 11_000, 19_000)
    state = tap(state, FIELD, 12_000, SPEED).state

    expect(state.rings).toEqual([[], [3]])
  })
})

describe('refused', () => {
  it('a refused ping is not spent', () => {
    const before = pinged(fresh(), FIELD, 1000, 9000)
    const loading = tap(settle(before, 9000), { x: 1, y: 1 }, 9500, SPEED).state
    const after = refused(loading)

    expect(after.phase).toBe('idle')
    expect(after.waves).toEqual(settle(before, 9000).waves)
    expect(after.rings).toEqual(before.rings)
    expect(after.pending).toBeNull()
  })

  it('does nothing when no ping is open', () => {
    const state = fresh()

    expect(refused(state)).toBe(state)
  })
})

describe('landed', () => {
  it('starts the wave of the open ping', () => {
    const state = landed(tap(fresh(), FIELD, 500, SPEED).state, 1000, 9000)

    expect(state.phase).toBe('wave')
    expect(state.waves).toEqual([{ at: FIELD, startMs: 1000, endMs: 9000 }])
    expect(state.pending).toBeNull()
  })

  it('does nothing when no ping is open', () => {
    const state = fresh()

    expect(landed(state, 1000, 9000)).toBe(state)
  })
})

describe('settle', () => {
  it('ends the wave at its end', () => {
    const wave = pinged(fresh(), FIELD, 1000, 9000)

    expect(settle(wave, 8999)).toBe(wave)
    expect(settle(wave, 9000).phase).toBe('idle')
  })

  it('leaves the other phases alone', () => {
    const state = fresh()

    expect(settle(state, 1e9)).toBe(state)
  })
})

describe('synced', () => {
  it('takes server steps it did not ping, without a wave', () => {
    const lost = { x: 6, y: 7 }
    const state = synced(fresh(), [lost])

    expect(state.waves).toEqual([{ at: lost, startMs: null, endMs: null }])
    expect(state.rings).toEqual([[]])
    expect(state.phase).toBe('idle')
  })

  it('keeps the pings it knows', () => {
    const wave = settle(pinged(fresh(), FIELD, 1000, 9000), 9000)

    expect(synced(wave, [FIELD])).toEqual(wave)
    expect(synced(wave, [])).toEqual(wave)
  })

  it('waits while a ping is open or a wave runs', () => {
    const loading = tap(fresh(), FIELD, 500, SPEED).state
    const running = landed(loading, 1000, 9000)

    expect(synced(loading, [FIELD, { x: 1, y: 1 }])).toBe(loading)
    expect(synced(running, [FIELD, { x: 1, y: 1 }])).toBe(running)
  })
})

describe('initialFlow', () => {
  const steps = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
  ]

  it('resumes open from the server steps and the draft', () => {
    const draft = { rings: [[2], [], [5, 6]], pins: [{ x: 9, y: 9 }] }
    const state = initialFlow({ clips: 2, pings: 5, steps, draft })

    expect(state.phase).toBe('idle')
    expect(state.waves.map((wave) => wave.at)).toEqual(steps)
    expect(state.waves.every((wave) => wave.startMs === null && wave.endMs === null)).toBe(true)
    expect(state.rings).toEqual(draft.rings)
    expect(state.pins).toEqual(draft.pins)
  })

  it('gives a wave without marks an empty list, and drops rings of waves it lacks', () => {
    const draft = { rings: [[2], [3], [4]], pins: [] }
    const state = initialFlow({ clips: 1, pings: 3, steps: steps.slice(0, 2), draft })

    expect(state.rings).toEqual([[2], [3]])

    expect(initialFlow({ clips: 1, pings: 3, steps, draft: null }).rings).toEqual([[], [], []])
  })
})

describe('statusLine', () => {
  it('says what a click does now', () => {
    const idle = fresh()
    expect(statusLine(idle)).toBe('1. Klick: Ping, 2. Klick: Markieren')

    const loading = tap(idle, FIELD, 500, SPEED).state
    expect(statusLine(loading)).toBe('Sonar lädt …')

    const wave = landed(loading, 1000, 9000)
    expect(statusLine(wave)).toBe('Markieren')

    expect(statusLine(settle(wave, 9000))).toBe('1. Klick: Ping, 2. Klick: Markieren')
  })
})

describe('guessOf', () => {
  it('makes a guess only with all pins, with rings per ping', () => {
    let state = fresh({ clips: 2, pings: 2 })
    state = pinged(state, { x: 4, y: 4 }, 1000, 9000)
    state = tap(state, FIELD, 2000, SPEED).state
    state = pinged(settle(state, 9000), { x: 12, y: 12 }, 11_000, 19_000)
    state = settle(state, 19_000)

    expect(guessOf(state)).toBeNull()

    state = hold(state, { x: 5, y: 5 })
    expect(guessOf(state)).toBeNull()

    state = hold(state, { x: 15, y: 15 })
    expect(guessOf(state)).toEqual({
      pins: [
        { x: 5, y: 5 },
        { x: 15, y: 15 },
      ],
      // wave 0 was marked once, wave 1 never
      rings: [[3], []],
    })
  })

  it('has no guess before the pins', () => {
    expect(guessOf(fresh())).toBeNull()
  })
})
