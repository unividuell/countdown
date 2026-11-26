/**
 * The clock a client-measured run reads: monotonic time, cancellable delays, and "after the next
 * paint". Injected, so a run's logic is tested with a fake one. Shared by Entstauber and Hochstapler.
 */
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
