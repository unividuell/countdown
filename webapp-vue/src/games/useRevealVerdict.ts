import { onBeforeUnmount, onMounted } from 'vue'
import { RESULTS_DELAY_MS, isStill } from '@/games/revealChoreography'
import { inBackground } from '@/ui/motion'
import { playVerdict, type Verdict } from '@/ui/verdictSound'

/**
 * A reveal's verdict: as the results start landing (`RESULTS_DELAY_MS`) — it is their signal, so no
 * row says it first. At once where nothing moves; only on a reveal that just happened here
 * (`animate`) — a reload is silent. `won` is read at mount: `null` plays none. Leaving cuts what is
 * sounding.
 */
export function useRevealVerdict(won: () => boolean | null, animate: boolean): void {
  let beat: ReturnType<typeof setTimeout> | undefined
  let verdict: Verdict | null = null

  onMounted(() => {
    const result = won()
    if (!animate || inBackground() || result === null) return

    beat = setTimeout(
      () => {
        verdict = playVerdict(result)
      },
      isStill(animate) ? 0 : RESULTS_DELAY_MS,
    )
  })

  onBeforeUnmount(() => {
    clearTimeout(beat)
    verdict?.stop()
  })
}
