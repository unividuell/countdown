<script setup lang="ts">
/**
 * The transport glyphs, from one set. Drawn as paths rather than taken from the Unicode
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
  stop: 'M6.5 6.5h11v11h-11z',
  close:
    'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z',
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
