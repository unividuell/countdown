import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'

/** The fake timers a reveal's timeline needs: it arms on two animation frames. */
export const TIMELINE_TIMERS: (
  'setTimeout' | 'clearTimeout' | 'requestAnimationFrame' | 'cancelAnimationFrame'
)[] = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame']

/** Arming takes two frames (~32 ms faked); every beat counts from there. */
export const ARMED_MS = 40

/** When a reveal without a story reaches its verdict. */
export const VERDICT_AT_MS = ARMED_MS + SOLUTION_DELAY_MS
