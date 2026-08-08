/**
 * Motion guards, shared by every component that animates: two plain, synchronous questions asked
 * at the moment an animation is about to start, not reactively. A caller that wants to react to
 * `prefers-reduced-motion` changing live is better served by VueUse's `usePreferredReducedMotion`
 * — these exist for the callers that just need the answer right now.
 */

/**
 * Whether the visitor has asked for less motion. Guarded for `window.matchMedia` being absent
 * altogether, which happy-dom (the frontend test DOM) does not provide.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Whether the tab is in the background, in which case nothing here may animate.
 *
 * Gecko pauses the refresh driver for a background tab: an animation created there never
 * advances, so it never finishes and is never released. A readout that changes once a second
 * accumulates such animations without bound whether anyone is looking or not — measured in
 * Firefox at 2824 live animations after two minutes in the background, against 58 in a foreground
 * tab. Over a working day that is hundreds of thousands of animation objects and gigabytes of
 * resident memory, which is what was crashing the tab.
 *
 * Skipping the animation costs nothing: it is a reveal, and there is nobody there to see it.
 */
export function inBackground(): boolean {
  return document.hidden
}
