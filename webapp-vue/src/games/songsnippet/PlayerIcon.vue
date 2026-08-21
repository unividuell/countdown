<script setup lang="ts">
/**
 * The three transport glyphs, from one set. Drawn as paths rather than taken from the Unicode
 * media block: ⏸ and ⏭ resolve to the platform's *emoji* font on iOS and macOS, so they arrive
 * boxed, coloured and a different weight than ▶ next to them — the reason this component exists.
 *
 * Sized in `em` so a button's own `text-*` class decides how big its icon is, and filled with
 * `currentColor` so the button's ink decides the colour.
 */
const PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6.5 5h3.5v14H6.5zM14 5h3.5v14H14z',
  skip: 'M6.5 5.5 15 12l-8.5 6.5zM16.5 5H19v14h-2.5z',
} as const

defineProps<{ name: keyof typeof PATHS }>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    class="size-[1em]"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>
