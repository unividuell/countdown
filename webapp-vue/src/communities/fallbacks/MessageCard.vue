<script setup lang="ts">
defineProps<{ title: string; text?: string }>()
</script>

<template>
  <div
    class="flex aspect-square w-full flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 text-center"
  >
    <p class="text-base font-semibold text-neutral-900">{{ title }}</p>
    <p v-if="text" class="mt-2 text-sm leading-relaxed text-neutral-600">{{ text }}</p>
  </div>
</template>
