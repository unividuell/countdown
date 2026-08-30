<script setup lang="ts">
/**
 * The object to find, as a band across the whole card.
 *
 * Mounted by `SpotObjectGame` above whichever face is showing, not by the board: the term is what
 * the round *is*, so it has to read the same while somebody searches and while everybody judges —
 * same words, same place, no re-reading between the two.
 *
 * Light, never dark: it sits directly under the card's own black header band, and a dark term on a
 * dark band disappeared into it. Larger than body text for the same reason — this is the one
 * sentence everything else on the card refers back to.
 */
defineProps<{ term: string }>()
</script>

<template>
  <p
    data-test="spot-term"
    class="border-b border-neutral-200 bg-neutral-100 px-4 py-3 text-center text-base font-semibold text-neutral-900 select-none"
  >
    „{{ term }}“
  </p>
</template>
