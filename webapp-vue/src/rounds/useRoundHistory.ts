import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { getRound } from '@/api/rounds'
import type { RoundResponse } from '@/api/types'
import { useAction } from '@/ui/useAction'

/**
 * The rounds below the running one — the run's past, one round per click.
 *
 * [from] is `previousRoundNumber` of the running round's answer, the entry into the past. The number
 * to load next is **derived, never stored**: an empty list means [from], otherwise it is the last
 * item's own pointer. A `null` there is „ganz am Anfang“, and that is exactly what hides the button
 * — no second request and no flag to keep in sync.
 */
export function useRoundHistory(
  slug: string,
  from: Ref<number | null>,
): {
  items: Ref<RoundResponse[]>
  busy: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  canLoadMore: ComputedRef<boolean>
  loadMore: () => Promise<void>
} {
  const items = ref<RoundResponse[]>([])
  const { busy, error, run } = useAction(() => 'Die Runde konnte nicht geladen werden.')

  const next = computed<number | null>(() => {
    const last = items.value[items.value.length - 1]
    return last === undefined ? from.value : last.previousRoundNumber
  })
  const canLoadMore = computed(() => next.value !== null)

  async function loadMore(): Promise<void> {
    const roundNumber = next.value
    if (roundNumber === null) return
    // `run` drops a second call while one is in flight, which is exactly the double-click guard the
    // button needs, and it clears `busy` in a `finally` so a failure does not lock it forever.
    await run(async () => {
      items.value = [...items.value, await getRound(slug, roundNumber)]
    })
  }

  /**
   * The first round loads by itself: somebody coming back the next day should see yesterday's
   * result without asking for it. The same function, not a second path.
   *
   * Re-runs when [from] changes, which is the day boundary passing under an open tab — `useRound`
   * refetched a different round after a 409, and a history hanging off the previous one would start
   * in the wrong place.
   */
  watch(
    from,
    () => {
      items.value = []
      void loadMore()
    },
    { immediate: true },
  )

  return { items, busy, error, canLoadMore, loadMore }
}
