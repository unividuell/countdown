import { onScopeDispose, readonly, ref } from 'vue'
import type { Ref } from 'vue'

/** One cell wetter per step; a starting value, to be turned by hand. */
export const WATER_STEP_MS = 110

/**
 * The water in the pipes. Timers, not animation frames: it runs in a background tab and under fake
 * timers alike.
 */
export function useWaterRun(): {
  wet: Readonly<Ref<ReadonlySet<number>>>
  run(cells: readonly number[], onEnd: () => void): void
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
  function run(cells: readonly number[], onEnd: () => void): void {
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
    }, WATER_STEP_MS)
  }

  function fill(cells: readonly number[]): void {
    stop()
    wet.value = new Set(cells)
  }

  onScopeDispose(stop)

  return { wet: readonly(wet), run, fill, stop }
}
