import { ref } from 'vue'
import type { Router } from 'vue-router'

// A bar that flashes for 30 ms is itself a flicker — the very defect this indicator
// belongs to fixing. Only a transition the user can actually perceive gets one.
export const PENDING_DELAY_MS = 150

export const navigationPending = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function stop(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  navigationPending.value = false
}

export function registerNavigationProgress(router: Router): void {
  router.beforeEach(() => {
    stop()
    timer = setTimeout(() => {
      navigationPending.value = true
    }, PENDING_DELAY_MS)
    return true
  })
  // afterEach also fires for aborted and redirected navigations, so the bar cannot
  // get stranded on a navigation that never commits.
  router.afterEach(stop)
  router.onError(stop)
}

/** Test-only: reset the module-level singleton between test cases. */
export function _resetNavigationProgressState(): void {
  stop()
}
