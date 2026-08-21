<script setup lang="ts">
// The surface a round is drawn on: on a phone a white band that spans the viewport, from `sm` the
// bordered card inside the content column. One slot, no props, no state.
//
// Mounted by whoever puts a game on a page — `rounds/RoundCard.vue` and the lab's game page — and
// never by a game itself. A game that frames itself is a game that can frame itself wrong, and
// two of them crossfading stack two borders for the length of the fade.
</script>

<template>
  <div
    data-test="round-surface"
    class="round-bleed border-y border-neutral-200 bg-white p-4 sm:rounded-xl sm:border-x"
  >
    <slot />
  </div>
</template>
