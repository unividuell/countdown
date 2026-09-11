import { onUnmounted, readonly, ref, type Ref } from 'vue'

/** One beat of the start signal, as the band's board spells it. */
export type StartBeat = '2' | '1' | 'GO!'

/**
 * What the band's board shows instead of the round countdown. `null` — the countdown itself — is
 * every other caller's case, which is why the prop carrying this defaults to it everywhere.
 */
export type PlayClock =
  | { phase: 'start'; beat: StartBeat }
  /** The instant the play's clock started: `me.revealedAt` in a real round. */
  | { phase: 'running'; since: string }

const BEATS: StartBeat[] = ['2', '1', 'GO!']

export const BEAT_MS = 1000

/**
 * How long `GO!` stays up at the least. Without a floor the one beat that has to be read flashes
 * for the length of a fast round trip and is gone inside the relight behind it.
 */
export const GO_HOLD_MS = 500

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The 2 · 1 · GO! in front of a timed round, and the thing it is a signal for.
 *
 * [go] fires ON the GO beat, never after it: the server stamps the play's start when it handles
 * that request, so this ordering is the whole reason the ceremony sits in front of the request
 * rather than beside it — it is what makes the displayed zero the scored zero.
 */
export function useStartCeremony(): {
  beat: Readonly<Ref<StartBeat | null>>
  run: (go: () => Promise<void>) => Promise<void>
} {
  const beat = ref<StartBeat | null>(null)
  // Final, per the composable rule for anything ticking outside Vue: a timer that has already
  // been handed to the browser still resumes, and what it would start belongs to nobody.
  let disposed = false

  async function run(go: () => Promise<void>): Promise<void> {
    if (disposed || beat.value !== null) return
    try {
      for (const next of BEATS) {
        if (disposed) return
        beat.value = next
        if (next !== 'GO!') {
          await wait(BEAT_MS)
          continue
        }
        // The hold runs beside the request, not after it: the clock starts on the beat, and the
        // beat stays legible while it does.
        await Promise.all([go(), wait(GO_HOLD_MS)])
      }
    } finally {
      beat.value = null
    }
  }

  onUnmounted(() => {
    disposed = true
  })

  return { beat: readonly(beat), run }
}
