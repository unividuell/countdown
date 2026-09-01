<script setup lang="ts">
/**
 * The object to find, as a chip.
 *
 * Mounted by `SpotObjectGame` in both faces, not by the board: the term is what the round *is*, so
 * it has to read the same while somebody searches and while everybody judges — same words, same
 * shape, no re-reading between the two.
 *
 * A chip and not a band: a band the width of the card cut the card in two, once between the header
 * and the map and once between the header and the reveal. Floating, the map runs past it on both
 * sides and the reveal's white surface stays one surface up to the header.
 */
defineProps<{ term: string }>()
</script>

<template>
  <p
    data-test="spot-term"
    class="mx-auto w-fit max-w-full truncate rounded-full bg-neutral-100 px-4 py-1.5 text-base font-semibold text-neutral-900 shadow select-none"
  >
    „{{ term }}“
  </p>
</template>
