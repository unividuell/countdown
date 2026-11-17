<script setup lang="ts">
/**
 * The transport's big button, in the one place both screens take it from. The board and the reveal
 * have to agree on its size to the pixel — it is one of the three things that must not move when a
 * round resolves — and the waiting ring drawn around it would otherwise be the same mask written
 * out twice.
 *
 * [waiting] is two states in one: it draws the ring and it disables the button, because a button
 * whose clip is still on its way has nothing to do yet and should look like it.
 */
import PlayerIcon from './PlayerIcon.vue'

/**
 * The ring, painted the way `HoldButton` paints its own: a conic sweep carved down to a rim by a
 * radial mask, so what shows is a thin arc travelling around the button rather than a disc. The rim
 * is a length rather than a percentage of the radius — this ring has exactly one size, and a length
 * says what it looks like without having to be rescaled if that size ever changes.
 */
const RING_MASK =
  'radial-gradient(closest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))'
const ring = {
  backgroundImage: 'conic-gradient(transparent 0deg 280deg, currentColor 280deg 360deg)',
  mask: RING_MASK,
  WebkitMask: RING_MASK,
}

defineProps<{
  label: string
  /** A clip is on its way: ring on, button out of reach until it lands. */
  waiting: boolean
  /** Anything else that makes pressing pointless — no audio to load at all, say. */
  disabled?: boolean
  /** Sounding: the button is the pause. */
  playing?: boolean
}>()
const emit = defineEmits<{ press: [] }>()
</script>

<template>
  <!-- The ring is absolute, so it hangs outside the button without taking any width from the row.
       Its box is pinned to the button's own size rather than left to the surrounding layout: a
       wrapper that ends up wider than tall turns the mask's `closest-side` into an ellipse. -->
  <span class="relative block size-20">
    <button
      type="button"
      data-test="play"
      class="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-amber-400 text-3xl text-neutral-950 disabled:opacity-40"
      :disabled="waiting || disabled"
      :aria-label="label"
      @click="emit('press')"
    >
      <PlayerIcon :name="playing ? 'pause' : 'play'" />
    </button>
    <span
      v-if="waiting"
      class="song-loading pointer-events-none absolute -inset-[6.25%] rounded-full text-amber-500"
      data-test="play-loading"
      role="status"
      aria-label="Ausschnitt wird geladen"
      :style="ring"
    />
  </span>
</template>

<!--
  The ring around the play button while a stage's clip is being cut and fetched — 600-900ms of song
  pipeline that the greyed-out button alone does not explain. Built like `HoldButton`'s ring, because
  that is what a ring around a round button already means here: a rim of the button's own colour, a
  gap between the two, one arc travelling. Anticlockwise, which is the one thing that tells the two
  apart at a glance: the hold button fills clockwise towards something, this one only waits. 1.1s
  per turn — slow enough to read as waiting rather than urgency. Motion is opt-in, as on `App.vue`'s
  navigation bar: reduced motion keeps the ring, standing still.
-->
<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .song-loading {
    animation: song-loading 1.1s linear infinite;
  }
}

@keyframes song-loading {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
}
</style>
