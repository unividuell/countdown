/**
 * One timeline per reveal: every beat, the verdict's sound, the roster's cue and the quiet rules,
 * from one origin (arming, two frames after mount). The reveal provides it; its picture and its
 * table read it. A game brings *what* moves on a beat, never *when*.
 *
 *   open ─ head ─ story ──[holds]── verdict ── +VERDICT_MS ── others
 *          table's   solution /      verdict sound, what      foreign rows,
 *          head      a story starts  judges, my row, roster   markers, knocks
 *
 * What judges my tip lands on `verdict`. A game with a story (water, a count) holds `verdict`
 * until its story ends; a game whose board already judged (`judged: 'before'`) reaches it with
 * the head, silently. Still — a reload, reduced motion, a background tab, no animation frames —
 * every beat is reached during setup; only reduced motion still hears the verdict.
 */
import { inject, onBeforeUnmount, onMounted, provide, readonly, ref } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import { HEAD_DELAY_MS, SOLUTION_DELAY_MS, VERDICT_MS } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { announceResults } from '@/ui/resultsLanding'
import { playVerdict, type Verdict } from '@/ui/verdictSound'

export type Beat = 'open' | 'head' | 'story' | 'verdict' | 'others'

const BEATS: readonly Beat[] = ['open', 'head', 'story', 'verdict', 'others']

export interface Hold {
  /** The story has ended: the verdict may fall, with its sound. */
  release(): void
  /** The story was cut short (a replay asked for): the verdict falls, unheard. */
  releaseSilently(): void
}

export interface RevealTimeline {
  /** Every beat reached at setup; nothing to schedule. */
  readonly still: boolean
  reached(beat: Beat): Readonly<Ref<boolean>>
  /** [run] once at [beat]; at once if it has passed. */
  on(beat: Beat, run: () => void): void
  /** Holds `verdict` until released. Taken after the verdict, it changes nothing. */
  hold(): Hold
}

export interface RevealTimelineOptions {
  /** The reveal happened here, now; false on a reload, which plays and announces nothing. */
  animate: boolean
  /** Whether my tip won, read at the verdict; `null` sounds none. */
  won: () => boolean | null
  /** The board already judged and sounded (Entstauber): the verdict falls with the head, silent. */
  judged?: 'before'
}

const KEY: InjectionKey<RevealTimeline> = Symbol('revealTimeline')

const NO_HOLD: Hold = { release: () => {}, releaseSilently: () => {} }

export function provideRevealTimeline(options: RevealTimelineOptions): RevealTimeline {
  const still =
    !options.animate ||
    prefersReducedMotion() ||
    inBackground() ||
    typeof requestAnimationFrame !== 'function'

  const flags = new Map(BEATS.map((beat) => [beat, ref(false)]))
  const waiting = new Map<Beat, (() => void)[]>(BEATS.map((beat) => [beat, []]))

  let disposed = false
  let holds = 0
  let silent = options.judged === 'before'
  let frame = 0
  const timers: ReturnType<typeof setTimeout>[] = []
  let verdict: Verdict | null = null

  const isReached = (beat: Beat) => flags.get(beat)!.value

  function reach(beat: Beat): void {
    if (disposed || isReached(beat)) return
    flags.get(beat)!.value = true

    if (beat === 'verdict') judge()
    for (const run of waiting.get(beat)!.splice(0)) run()
  }

  function after(delayMs: number, run: () => void): void {
    timers.push(setTimeout(run, delayMs))
  }

  /** The verdict's sound and the roster's cue; then the others after it. */
  function judge(): void {
    if (options.animate) {
      const won = options.won()
      if (!silent && won !== null && !inBackground()) verdict = playVerdict(won)
      announceResults()
    }
    if (!still) after(VERDICT_MS, () => reach('others'))
  }

  /** The story is told, or there is none: the verdict may fall once every hold is gone. */
  function maybeJudge(): void {
    if (isReached('story') && holds === 0) reach('verdict')
  }

  function start(): void {
    reach('open')
    after(HEAD_DELAY_MS, () => {
      reach('head')
      if (options.judged === 'before') {
        reach('story')
        reach('verdict')
      }
    })
    after(SOLUTION_DELAY_MS, () => {
      reach('story')
      maybeJudge()
    })
  }

  // Still: the whole sequence during setup, in order, so the first render is the end state.
  if (still) for (const beat of BEATS) reach(beat)

  onMounted(() => {
    if (still) return
    // Two frames, as `useRevealArming`: a painted „from“ state before any transition starts.
    frame = requestAnimationFrame(() => {
      void document.body.offsetHeight
      frame = requestAnimationFrame(() => {
        frame = 0
        start()
      })
    })
  })

  onBeforeUnmount(() => {
    disposed = true
    if (frame) cancelAnimationFrame(frame)
    timers.forEach(clearTimeout)
    verdict?.stop()
  })

  const timeline: RevealTimeline = {
    still,
    reached: (beat) => readonly(flags.get(beat)!),
    on(beat, run) {
      if (isReached(beat)) run()
      else waiting.get(beat)!.push(run)
    },
    hold() {
      if (isReached('verdict')) return NO_HOLD
      holds++
      let released = false
      const release = (quiet: boolean) => {
        if (released || disposed) return
        released = true
        holds--
        if (quiet) silent = true
        maybeJudge()
      }
      return { release: () => release(false), releaseSilently: () => release(true) }
    },
  }

  provide(KEY, timeline)

  return timeline
}

export function useRevealTimeline(): RevealTimeline {
  const timeline = inject(KEY, null)
  if (!timeline) throw new Error('useRevealTimeline outside a reveal: call provideRevealTimeline')

  return timeline
}
