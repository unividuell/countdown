import { onUnmounted, readonly, ref, type Ref } from 'vue'

/** One beat of the count-in. Single digits, so the board flips between them instead of resizing. */
export type StartBeat = '3' | '2' | '1'

/** Where the count-in stands: on a beat, or waiting out the request the last beat sent. */
export type StartStep = StartBeat | 'waiting'

/**
 * What the band's board shows instead of the round countdown. `null` — the countdown itself — is
 * every other caller's case, which is why the prop carrying this defaults to it everywhere.
 */
export type PlayClock =
  | { phase: 'start'; beat: StartBeat }
  /** The reveal is in flight. The board holds a solid field for exactly this long. */
  | { phase: 'waiting' }
  /** The instant the play's clock started: `me.revealedAt` in a real round. */
  | { phase: 'running'; since: string }

const BEATS: StartBeat[] = ['3', '2', '1']

export const BEAT_MS = 1000

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The 3 · 2 · 1 in front of a timed round, and the request it sends.
 *
 * [go] leaves only once the count-in is spent: the server stamps the play's start when it handles
 * that request, so a request sent any earlier would start the clock while the player was still
 * being counted in.
 *
 * The `waiting` step lasts exactly as long as [go] does, and nothing pads it. That is what lets
 * the board's solid field stand in for a loading indicator: it is on screen while the request is,
 * and gone when the answer is. Its floor comes from the board, not from here — the width change
 * into that field relights it, and a relight is 300 ms of lit dots either way.
 */
export function useStartCeremony(): {
  step: Readonly<Ref<StartStep | null>>
  run: (go: () => Promise<void>) => Promise<void>
} {
  const step = ref<StartStep | null>(null)
  // Final, per the composable rule for anything ticking outside Vue: a timer that has already
  // been handed to the browser still resumes, and what it would start belongs to nobody.
  let disposed = false

  async function run(go: () => Promise<void>): Promise<void> {
    if (disposed || step.value !== null) return
    try {
      for (const beat of BEATS) {
        if (disposed) return
        step.value = beat
        await wait(BEAT_MS)
      }
      // Checked again after the loop, not only inside it: the last beat's timer resolves like any
      // other, and an unmount during it must still cost the player nothing.
      if (disposed) return
      step.value = 'waiting'
      await go()
    } finally {
      step.value = null
    }
  }

  onUnmounted(() => {
    disposed = true
  })

  return { step: readonly(step), run }
}
