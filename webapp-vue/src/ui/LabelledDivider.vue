<script setup lang="ts">
// A horizontal rule with a label in its middle: the seam between the running round and the run's
// past, and the closing line at its beginning.
//
// Presentational only. The rules are `aria-hidden`, the label is ordinary text in the reading
// order — a section heading would be wrong for „Du bist ganz am Anfang angekommen", which is a
// sentence, not a heading.
</script>

<template>
  <div data-test="labelled-divider" class="flex items-center">
    <span class="grow border-t border-neutral-300" aria-hidden="true" />
    <span data-test="labelled-divider-label" class="mx-4 shrink-0 text-sm text-neutral-500">
      <slot />
    </span>
    <span class="grow border-t border-neutral-300" aria-hidden="true" />
  </div>
</template>
