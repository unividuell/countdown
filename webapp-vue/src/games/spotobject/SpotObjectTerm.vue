<script setup lang="ts">
/**
 * The object to find, as a band across the whole card.
 *
 * Mounted by `SpotObjectGame` above whichever face is showing, not by the board: the term is what
 * the round *is*, so it has to read the same while somebody searches and while everybody judges —
 * same words, same place, no re-reading between the two.
 */
defineProps<{ term: string }>()
</script>

<template>
  <p
    data-test="spot-term"
    class="bg-neutral-900 px-4 py-2 text-center text-sm font-medium text-white select-none"
  >
    „{{ term }}“
  </p>
</template>
