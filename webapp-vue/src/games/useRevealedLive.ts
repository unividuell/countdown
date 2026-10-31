import { readonly, ref, watch, type Ref, type WatchSource } from 'vue'

/**
 * Whether the reveal just *happened* here, rather than being true on mount — a reload must not
 * replay the choreography. Flips on a live `false → true` of [revealed] and stays true.
 *
 * A `watch` without `immediate` never fires for the initial value, so an instance mounting
 * already revealed starts `false`. A setup-time constant would not do: the lab keys a game on the
 * round's seed, so one instance can cross the revealed boundary more than once (reload into a spent
 * round, delete the guess, guess again), and the second live crossing must arm the beats too.
 *
 * The default `pre` flush sets the flag before the reveal card re-renders, so the card already
 * reads `true` on mount. A `post` flush would drop the first beat; the spec pins it.
 */
export function useRevealedLive(revealed: WatchSource<boolean>): Readonly<Ref<boolean>> {
  const live = ref(false)

  watch(revealed, (now, before) => {
    if (!before && now) live.value = true
  })

  return readonly(live)
}
