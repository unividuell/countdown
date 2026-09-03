<script setup lang="ts">
// The surface a round is drawn on: on a phone a white band that spans the viewport, from `sm` the
// bordered card inside the content column. Two slots, no props, no state.
//
// Mounted by whoever puts a game on a page — `rounds/RoundCard.vue` and the lab's game page — and
// never by a game itself. A game that frames itself is a game that can frame itself wrong, and
// two of them crossfading stack two borders for the length of the fade.
//
// `#header` sits outside the body's gutter, because a band that spans the card cannot live inside
// the padding — and above it, so the card's own radius is the only radius anyone states. The clip
// that makes an opaque band meet that radius is `sm:overflow-hidden`: below `sm` there is no corner
// to clip, and a clipping ancestor there would only cost a game the room to animate out of its box.
</script>

<template>
  <div
    data-test="round-surface"
    class="round-bleed border-y border-neutral-200 bg-white sm:overflow-hidden sm:rounded-xl sm:border-x"
  >
    <div v-if="$slots.header" data-test="round-surface-header">
      <slot name="header" />
    </div>
    <div data-test="round-surface-body" class="p-4">
      <slot />
    </div>
  </div>
</template>
