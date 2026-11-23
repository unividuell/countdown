import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'
import { REVEAL_TIMELINE, createRevealTimeline } from '@/games/revealTimeline'

/** The fake timers a reveal's timeline needs: it arms on two animation frames. */
export const TIMELINE_TIMERS: (
  'setTimeout' | 'clearTimeout' | 'requestAnimationFrame' | 'cancelAnimationFrame'
)[] = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame']

/** Arming takes two frames (~32 ms faked); every beat counts from there. */
export const ARMED_MS = 40

/** When a reveal without a story reaches its verdict. */
export const VERDICT_AT_MS = ARMED_MS + SOLUTION_DELAY_MS

/**
 * A timeline for a spec that mounts a picture or a table on its own: pass `provide` as
 * `global.provide`, then `arm()` to start the beats at the fake clock's now — no frames.
 */
export function testTimeline(animate: boolean) {
  const { timeline, arm, dispose } = createRevealTimeline({ animate, won: () => null })

  return { timeline, arm, dispose, provide: { [REVEAL_TIMELINE as symbol]: timeline } }
}
