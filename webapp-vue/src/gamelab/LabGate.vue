<script setup lang="ts">
/**
 * Renders a lab page only where the server has the labs. The SPA bundle is identical in every
 * environment, so the page cannot know whether it runs in production — `GET /api/lab` does, and
 * 404s there.
 */
import { onMounted, ref } from 'vue'
import { ApiError } from '@/api/client'
import { checkLabGate } from './api'

defineProps<{ title: string }>()

const state = ref<'checking' | 'open' | 'off' | 'failed'>('checking')

onMounted(async () => {
  try {
    await checkLabGate()
    state.value = 'open'
  } catch (err) {
    state.value = err instanceof ApiError && err.status === 404 ? 'off' : 'failed'
  }
})
</script>

<template>
  <slot v-if="state === 'open'" />
  <div v-else-if="state === 'off'" data-test="lab-unavailable" class="py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">{{ title }} nicht verfügbar</h1>
    <p class="text-sm text-on-surface-variant">In dieser Umgebung ist das Labor abgeschaltet.</p>
  </div>
  <p v-else-if="state === 'failed'" data-test="lab-gate-error" class="py-8 text-sm text-error">
    Das Labor ist gerade nicht erreichbar.
  </p>
</template>
