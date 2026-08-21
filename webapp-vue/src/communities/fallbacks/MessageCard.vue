<script setup lang="ts">
/**
 * A one- or two-line message drawn on the shared round surface, for the states that have no
 * board of their own (no date yet, the round is over).
 *
 * No `w-full` in the template below: the surface's bleed can only widen a box whose width is
 * `auto` — with a definite width the margin equation is over-constrained and the box shifts
 * sideways instead. The square is therefore the band's own, which is what keeps this state, the
 * countdown and the placeholder at one edge length.
 */
import RoundSurface from '@/ui/RoundSurface.vue'

defineProps<{ title: string; text?: string }>()
</script>

<template>
  <RoundSurface class="flex aspect-square flex-col items-center justify-center text-center">
    <p class="text-base font-semibold text-neutral-900">{{ title }}</p>
    <p v-if="text" class="mt-2 text-sm leading-relaxed text-neutral-600">{{ text }}</p>
  </RoundSurface>
</template>
