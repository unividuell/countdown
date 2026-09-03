<script setup lang="ts">
/**
 * The aiming mark, in the exact centre of whatever it is laid over.
 *
 * One mark for two jobs that have to mean the same thing. While searching it is where the Pegman
 * lands and where the object belongs in frame; on a tip it is the point the player put it at. The
 * two line up by construction: the still is rendered around the submitted heading and pitch, so
 * the object *is* the image's centre pixel — and `object-cover` crops outwards from the centre, so
 * the mark stays on it whatever shape the frame has.
 *
 * A plain white plus, Minecraft's: two bars, no ring, no fill, a shadow thin enough to read on a
 * white wall without becoming furniture.
 */
</script>

<template>
  <div
    data-test="spot-crosshair"
    class="pointer-events-none absolute inset-0 flex items-center justify-center"
  >
    <div class="relative size-5 opacity-90 drop-shadow-[0_0_1px_rgba(0,0,0,0.9)]">
      <span class="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-white" />
      <span class="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-white" />
    </div>
  </div>
</template>
