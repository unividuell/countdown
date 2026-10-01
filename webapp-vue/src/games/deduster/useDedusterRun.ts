/**
 * One Entstauber run, as logic without a screen: tiles fall on a fixed beat grid, each must be
 * hit before the next, and the first wrong tap or missed beat ends it.
 *
 * Measured with a monotonic clock and stamped after the tile has been painted, so render time is
 * not counted as reaction. The clock is injected; the board passes [browserClock].
 */
import { getCurrentScope, onScopeDispose, readonly, ref } from 'vue'
import type { DedusterEnd } from './types'

export interface RunClock {
  now(): number
  /** Runs [fn] after [delayMs]; the returned function cancels it. */
  schedule(fn: () => void, delayMs: number): () => void
  /** Runs [fn] once the change just made has reached the screen. */
  afterPaint(fn: () => void): void
}

export const browserClock: RunClock = {
  now: () => performance.now(),
  // The globals, not `window.`: they are what fake timers replace in the board's tests.
  schedule(fn, delayMs) {
    const id = setTimeout(fn, delayMs)
    return () => clearTimeout(id)
  },
  afterPaint(fn) {
    requestAnimationFrame(() => fn())
  },
}

export interface RunResult {
  reactionsMs: number[]
  endedBy: DedusterEnd
  wrongTileIndex: number | null
}

export type TapResult = 'hit' | 'miss' | 'ignored'

export function useDedusterRun(input: {
  order: readonly number[]
  intervalMs: number
  onEnd: (result: RunResult) => void
  clock?: RunClock
}) {
  const clock = input.clock ?? browserClock
  /** How many tiles are off; the hot one is `order[revealed - 1]`. */
  const revealed = ref(0)
  const running = ref(false)
  const ended = ref(false)
  const reactions: number[] = []

  let tileZeroAt = 0
  let fellAt = 0
  let hit = false
  let cancelTick: (() => void) | null = null

  // A fixed grid from tile 0, not a chain of delays: a late timer must not push every later beat.
  function scheduleTick(level: number): void {
    const due = tileZeroAt + level * input.intervalMs
    cancelTick = clock.schedule(() => onTick(level), Math.max(0, due - clock.now()))
  }

  function onTick(level: number): void {
    if (ended.value) return
    if (level > 0 && !hit) return finish('TOO_LATE', null)
    if (level >= input.order.length) return
    revealed.value = level + 1
    hit = false
    fellAt = clock.now()
    clock.afterPaint(() => {
      if (revealed.value === level + 1 && !hit) fellAt = clock.now()
    })
    scheduleTick(level + 1)
  }

  function finish(endedBy: DedusterEnd, wrongTileIndex: number | null): void {
    if (ended.value) return
    ended.value = true
    running.value = false
    cancelTick?.()
    input.onEnd({ reactionsMs: [...reactions], endedBy, wrongTileIndex })
  }

  function start(at: number): void {
    if (running.value || ended.value) return
    running.value = true
    tileZeroAt = at
    scheduleTick(0)
  }

  function tap(index: number): TapResult {
    if (!running.value || revealed.value === 0) return 'ignored'
    if (index !== input.order[revealed.value - 1]) {
      finish('WRONG_TILE', index)
      return 'miss'
    }
    if (!hit) {
      hit = true
      reactions.push(Math.max(0, Math.round(clock.now() - fellAt)))
      if (revealed.value === input.order.length) finish('COMPLETE', null)
    }
    return 'hit'
  }

  function abandon(): void {
    if (running.value) finish('TOO_LATE', null)
  }

  if (getCurrentScope()) onScopeDispose(() => cancelTick?.())

  return {
    revealed: readonly(revealed),
    running: readonly(running),
    ended: readonly(ended),
    start,
    tap,
    abandon,
  }
}
