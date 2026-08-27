import { onBeforeUnmount, onMounted, readonly, ref, type Ref } from 'vue'

/**
 * The accessibility guarantee every reveal in this app makes: when there is no beat to play, it
 * must simply be there, fully drawn — never staged behind frames nobody is watching, or that
 * never fire at all. [still] is the caller's own answer to "should this reveal skip its beats" —
 * a reload, reduced motion, a background tab, or whatever else its own choreography depends on.
 * This adds one more reason of its own, so a caller cannot forget it: an environment with no
 * `requestAnimationFrame` at all.
 *
 * When it does animate, `shown` flips from `false` to `true` two frames after mount, never one: a
 * transition set and started in the same frame never runs, in every engine, and Firefox is
 * stricter still — it only starts a transition off a style it has *already resolved* in an
 * earlier frame, and `onMounted` runs before style has ever been resolved for these elements, so
 * a single rAF fires in the very frame that would first resolve it. Vue's class patch lands in a
 * microtask ahead of that frame's style recalc, so Firefox finds no "from" value and jumps
 * straight to the end state; Chrome tolerates this, Firefox does not. Vue's own `<Transition>`
 * never hits this because it forces a reflow before adding its enter-active class — mirrored here
 * by hand: force the reflow in the first frame, then flip `shown` only in the second, so a
 * painted "from" frame is guaranteed to exist first. Belt and braces on purpose — this was
 * observed failing in the wild, and one extra frame against a beat delay measured in hundreds of
 * milliseconds costs nothing.
 *
 * [onArmed], if given, runs right after `shown` flips — the moment it is safe to start whatever
 * else was waiting on the beats actually being live (`HueWheelReveal` hands off to its band-grow
 * loop there).
 */
export function useRevealArming(
  still: boolean,
  onArmed?: () => void,
): { shown: Readonly<Ref<boolean>> } {
  const skip = still || typeof requestAnimationFrame !== 'function'
  const shown = ref(skip)
  let frame = 0

  onMounted(() => {
    if (skip) return
    frame = requestAnimationFrame(() => {
      // Read for the side effect, not the value — this is exactly Vue's own forceReflow().
      void document.body.offsetHeight
      frame = requestAnimationFrame(() => {
        frame = 0
        shown.value = true
        onArmed?.()
      })
    })
  })

  onBeforeUnmount(() => {
    if (frame) cancelAnimationFrame(frame)
  })

  return { shown: readonly(shown) }
}
