import { describe, expect, it } from 'vitest'
import {
  guessOf,
  initialFlow,
  landed,
  LIFT_RADIUS,
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

/** The first tap: sound unlocked, nothing pinged. */
function opened(state: FlowState = fresh()): FlowState {
  return tap(state, FIELD, 0, SPEED).state
}

/** A ping at `at` whose wave runs from `startMs` to `endMs`. */
function pinged(state: FlowState, at: Point, startMs: number, endMs: number): FlowState {
  return landed(tap(state, at, startMs - 100, SPEED).state, startMs, endMs)
}

/** `count` pings, each wave over before the next tap. */
function spent(count: number, clips = 1): FlowState {
  let state = opened(fresh({ clips, pings: count }))

  for (let i = 0; i < count; i++) {
    state = pinged(state, { x: 4 + i, y: 4 }, 1000 + i * 10_000, 6000 + i * 10_000)
  }

  return settle(state, 100_000)
}

describe('tap', () => {
  it('opens with the first tap and pings nothing', () => {
    const result = tap(fresh(), FIELD, 0, SPEED)

    expect(result.state.phase).toBe('pinging')
    expect(result.effect).toEqual({ kind: 'unlock' })
    expect(result.state.waves).toEqual([])
    expect(result.state.pending).toBeNull()
  })

  it('opens straight into pinning when every ping is already spent', () => {
    const state = initialFlow({
      clips: 1,
      pings: 2,
      steps: [FIELD, FIELD],
      draft: null,
    })

    expect(tap(state, FIELD, 0, SPEED).state.phase).toBe('pinning')
  })

  it('a tap pings at its spot and counts the ping at once', () => {
    const at = { x: 3, y: 4 }
    const result = tap(opened(), at, 500, SPEED)

    expect(result.effect).toEqual({ kind: 'ping', stage: 0, at })
    expect(result.state.phase).toBe('loading')
    expect(result.state.pending).toEqual(at)
    expect(result.state.waves).toEqual([{ at, startMs: null, endMs: null }])
    expect(result.state.rings).toEqual([[]])
    expect(statusLine(result.state)).toBe('Sonar lädt …')
  })

  it('ignores taps while the sonar loads', () => {
    const loading = tap(opened(), FIELD, 500, SPEED).state
    const result = tap(loading, { x: 1, y: 1 }, 600, SPEED)

    expect(result.effect).toBeNull()
    expect(result.state).toEqual(loading)
  })

  it('marks rings during the wave, at most clips of them', () => {
    const wave = pinged(opened(), FIELD, 1000, 9000)

    const first = tap(wave, FIELD, 2000, SPEED)
    expect(first.effect).toBeNull()
    expect(first.state.rings).toEqual([[3]])

    // clips is 1: the second tap in the same wave does nothing
    const second = tap(first.state, FIELD, 3000, SPEED)
    expect(second.state.rings).toEqual([[3]])
    expect(second.state.phase).toBe('wave')

    const twoClips = pinged(opened(fresh({ clips: 2 })), FIELD, 1000, 9000)
    const marked = [2000, 3000, 4000].reduce(
      (state, tMs) => tap(state, FIELD, tMs, SPEED).state,
      twoClips,
    )
    expect(marked.rings).toEqual([[3, 6]])
  })

  it('marks no ring before the wave starts', () => {
    // the wave starts after the audio latency; the ping's answer came earlier
    const wave = pinged(opened(), FIELD, 1000, 9000)
    const result = tap(wave, FIELD, 900, SPEED)

    expect(result.state.rings).toEqual([[]])
    expect(result.effect).toBeNull()
  })

  it('measures a ring from the wave start at the tap time', () => {
    const wave = pinged(opened(), FIELD, 1000, 9000)

    expect(tap(wave, FIELD, 2500, SPEED).state.rings).toEqual([[4.5]])
  })

  it('records no ring at or after the end of the wave', () => {
    const wave = pinged(opened(), FIELD, 1000, 9000)

    // the end itself already belongs to the next ping
    const atEnd = tap(wave, FIELD, 9000, SPEED)
    expect(atEnd.state.rings[0]).toEqual([])
    expect(atEnd.effect).toEqual({ kind: 'ping', stage: 1, at: FIELD })

    const after = tap(wave, FIELD, 12_000, SPEED)
    expect(after.state.rings[0]).toEqual([])

    // the last moment of the wave still marks, within what the wave allows
    const within = tap(wave, FIELD, 8999, SPEED).state.rings[0]?.[0] ?? Infinity
    expect(within).toBeLessThanOrEqual((SPEED * (9000 - 1000)) / 1000)
  })

  it('after the wave the next tap is the next ping', () => {
    const wave = pinged(opened(), FIELD, 1000, 9000)
    const at = { x: 15, y: 5 }
    const result = tap(wave, at, 9500, SPEED)

    expect(result.effect).toEqual({ kind: 'ping', stage: 1, at })
    expect(result.state.phase).toBe('loading')
    expect(result.state.waves).toHaveLength(2)
    expect(result.state.rings).toEqual([[], []])
  })

  it('after the last wave a tap sets a pin', () => {
    const state = spent(3)

    expect(state.phase).toBe('pinning')

    const result = tap(state, { x: 7, y: 8 }, 200_000, SPEED)
    expect(result.effect).toBeNull()
    expect(result.state.pins).toEqual([{ x: 7, y: 8 }])
  })

  it('sets the pin of a tap that ends the last wave', () => {
    const wave = pinged(opened(fresh({ pings: 1 })), FIELD, 1000, 9000)
    const result = tap(wave, { x: 2, y: 2 }, 9000, SPEED)

    expect(result.state.phase).toBe('pinning')
    expect(result.state.pins).toEqual([{ x: 2, y: 2 }])
  })

  it('lifts a pin by tapping it, sets none beyond clips', () => {
    const placed = tap(spent(3, 2), { x: 5, y: 5 }, 200_000, SPEED).state

    // inside the lift radius: the pin goes
    const lifted = tap(placed, { x: 5 + LIFT_RADIUS - 0.01, y: 5 }, 200_001, SPEED).state
    expect(lifted.pins).toEqual([])

    // exactly on the radius: not near enough, a second pin goes down
    const second = tap(placed, { x: 5 + LIFT_RADIUS, y: 5 }, 200_001, SPEED).state
    expect(second.pins).toHaveLength(2)

    // clips is 2: a third tap away from both pins does nothing
    const third = tap(second, { x: 15, y: 15 }, 200_002, SPEED)
    expect(third.state.pins).toEqual(second.pins)
    expect(third.effect).toBeNull()
  })
})

describe('refused', () => {
  it('a refused ping is not spent', () => {
    const before = opened()
    const loading = tap(before, { x: 3, y: 4 }, 500, SPEED).state
    const after = refused(loading)

    expect(after.phase).toBe('pinging')
    expect(after.pending).toBeNull()
    expect(after.waves).toEqual(before.waves)
    expect(after.rings).toEqual(before.rings)
    expect(statusLine(after)).toBe('Ping + Markieren · noch 3')
  })

  it('keeps what is already pinged', () => {
    const wave = pinged(opened(), FIELD, 1000, 9000)
    const loading = tap(wave, { x: 2, y: 2 }, 9500, SPEED).state
    const after = refused(loading)

    expect(after.waves).toEqual(wave.waves)
    expect(after.rings).toEqual(wave.rings)
  })

  it('does nothing when no ping is open', () => {
    const wave = pinged(opened(), FIELD, 1000, 9000)

    expect(refused(wave)).toBe(wave)
  })
})

describe('landed', () => {
  it('starts the wave of the open ping', () => {
    const loading = tap(opened(), FIELD, 500, SPEED).state
    const state = landed(loading, 1000, 9000)

    expect(state.phase).toBe('wave')
    expect(state.pending).toBeNull()
    expect(state.waves).toEqual([{ at: FIELD, startMs: 1000, endMs: 9000 }])
  })

  it('does nothing when no ping is open', () => {
    const state = opened()

    expect(landed(state, 1000, 9000)).toBe(state)
  })
})

describe('settle', () => {
  it('ends the wave at its end, into the next ping or the pins', () => {
    const wave = pinged(opened(), FIELD, 1000, 9000)

    expect(settle(wave, 8999)).toBe(wave)
    expect(settle(wave, 9000).phase).toBe('pinging')

    const last = pinged(opened(fresh({ pings: 1 })), FIELD, 1000, 9000)
    expect(settle(last, 9000).phase).toBe('pinning')
  })

  it('leaves the other phases alone', () => {
    const state = opened()

    expect(settle(state, 1e9)).toBe(state)
  })
})

describe('synced', () => {
  it('takes server steps it did not ping, without a wave', () => {
    const lost = { x: 6, y: 7 }
    const state = synced(opened(), [lost])

    expect(state.waves).toEqual([{ at: lost, startMs: null, endMs: null }])
    expect(state.rings).toEqual([[]])
    expect(state.phase).toBe('pinging')
    expect(statusLine(state)).toBe('Ping + Markieren · noch 2')
  })

  it('moves on to the pins when that was the last ping', () => {
    const wave = pinged(opened(fresh({ pings: 2 })), FIELD, 1000, 9000)
    const state = synced(settle(wave, 9000), [FIELD, { x: 1, y: 1 }])

    expect(state.phase).toBe('pinning')
    expect(state.waves[1]).toEqual({ at: { x: 1, y: 1 }, startMs: null, endMs: null })
  })

  it('keeps the pings it knows', () => {
    const wave = settle(pinged(opened(), FIELD, 1000, 9000), 9000)

    expect(synced(wave, [FIELD])).toEqual(wave)
    expect(synced(wave, [])).toEqual(wave)
  })

  it('waits while a ping is open or a wave runs', () => {
    const loading = tap(opened(), FIELD, 500, SPEED).state
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

  it('resumes from the server steps and the draft', () => {
    const draft = { rings: [[2], [], [5, 6]], pins: [{ x: 9, y: 9 }] }
    const state = initialFlow({ clips: 2, pings: 3, steps, draft })

    expect(state.phase).toBe('closed')
    expect(state.waves.map((wave) => wave.at)).toEqual(steps)
    expect(state.waves.every((wave) => wave.startMs === null && wave.endMs === null)).toBe(true)
    expect(state.rings).toEqual(draft.rings)
    expect(state.pins).toEqual(draft.pins)

    const reopened = tap(state, FIELD, 0, SPEED).state
    expect(reopened.phase).toBe('pinning')
    expect(statusLine(reopened)).toBe('Schätzung · Pins 1/2')
  })

  it('gives a wave without marks an empty list, and drops rings of waves it lacks', () => {
    const draft = { rings: [[2], [3], [4]], pins: [] }
    const state = initialFlow({ clips: 1, pings: 3, steps: steps.slice(0, 2), draft })

    expect(state.rings).toEqual([[2], [3]])

    expect(initialFlow({ clips: 1, pings: 3, steps, draft: null }).rings).toEqual([[], [], []])
  })

  it('keeps no pins while pings are left', () => {
    const draft = { rings: [], pins: [{ x: 9, y: 9 }] }

    expect(initialFlow({ clips: 1, pings: 3, steps: steps.slice(0, 1), draft }).pins).toEqual([])
  })
})

describe('statusLine', () => {
  it('follows the status line', () => {
    const closed = fresh()
    expect(statusLine(closed)).toBe('Antippen zum Starten')

    const pinging = opened()
    expect(statusLine(pinging)).toBe('Ping + Markieren · noch 3')

    const loading = tap(pinging, FIELD, 500, SPEED).state
    expect(statusLine(loading)).toBe('Sonar lädt …')

    const wave = landed(loading, 1000, 9000)
    expect(statusLine(wave)).toBe('Markieren')

    expect(statusLine(settle(wave, 9000))).toBe('Ping + Markieren · noch 2')

    const pinning = spent(3, 2)
    expect(statusLine(pinning)).toBe('Schätzung · Pins 0/2')
    expect(statusLine(tap(pinning, FIELD, 200_000, SPEED).state)).toBe('Schätzung · Pins 1/2')
  })
})

describe('guessOf', () => {
  it('makes a guess only with all pins, with rings per ping', () => {
    let state = opened(fresh({ clips: 2, pings: 2 }))
    state = pinged(state, { x: 4, y: 4 }, 1000, 9000)
    state = tap(state, FIELD, 2000, SPEED).state
    state = pinged(settle(state, 9000), { x: 12, y: 12 }, 11_000, 19_000)
    state = settle(state, 19_000)

    expect(guessOf(state)).toBeNull()

    state = tap(state, { x: 5, y: 5 }, 20_000, SPEED).state
    expect(guessOf(state)).toBeNull()

    state = tap(state, { x: 15, y: 15 }, 20_001, SPEED).state
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
