import { onScopeDispose, readonly, ref } from 'vue'
import type { Ref } from 'vue'

/**
 * A full run, inlet to outlet through every pipe, whatever the board's size. The table and the
 * roster wait for it and the verdict after it; a longer run raises the roster's ceiling
 * (`SPOILER_HOLD_MS`).
 */
export const WATER_RUN_MS = 2000

/** One cell wetter per step: 8×8 ≈ 31 ms, 6×6 ≈ 56 ms. */
export function waterStepMs(size: number): number {
  return WATER_RUN_MS / (size * size)
}

/**
 * The water in the pipes. Timers, not animation frames: it runs in a background tab and under fake
 * timers alike.
 */
export function useWaterRun(): {
  wet: Readonly<Ref<ReadonlySet<number>>>
  run(cells: readonly number[], onEnd: () => void, stepMs: number): void
  fill(cells: readonly number[]): void
  stop(): void
} {
  const wet = ref<ReadonlySet<number>>(new Set())
  let timer: ReturnType<typeof setInterval> | undefined

  function stop(): void {
    clearInterval(timer)
    timer = undefined
  }

  /** Dry, then one more cell every step; [onEnd] after the last — never after a [stop]. */
  function run(cells: readonly number[], onEnd: () => void, stepMs: number): void {
    stop()
    wet.value = new Set()
    if (cells.length === 0) return onEnd()

    let reached = 0
    timer = setInterval(() => {
      reached += 1
      wet.value = new Set(cells.slice(0, reached))
      if (reached < cells.length) return

      stop()
      onEnd()
    }, stepMs)
  }

  function fill(cells: readonly number[]): void {
    stop()
    wet.value = new Set(cells)
  }

  onScopeDispose(stop)

  return { wet: readonly(wet), run, fill, stop }
}
