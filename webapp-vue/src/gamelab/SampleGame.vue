<script setup lang="ts">
import { ref } from 'vue'
import type { SampleOutcome, SamplePayload } from './types'

const props = defineProps<{
  payload: SamplePayload
  outcome: SampleOutcome | null
  disabled: boolean
}>()
const emit = defineEmits<{ guess: [value: unknown] }>()

const value = ref<number | null>(null)

const DIRECTIONS: Record<SampleOutcome['direction'], string> = {
  HIGHER: 'Die gesuchte Zahl ist größer.',
  LOWER: 'Die gesuchte Zahl ist kleiner.',
  EXACT: 'Genau getroffen.',
}

function submit(): void {
  if (value.value === null) return
  emit('guess', { value: value.value })
}
</script>

<template>
  <div class="rounded-lg border border-neutral-200 p-4">
    <p data-test="sample-bounds" class="mb-3 text-sm text-neutral-600">
      Gesucht ist eine Zahl zwischen {{ props.payload.lowerBound }} und
      {{ props.payload.upperBound }}.
    </p>
    <form data-test="sample-submit" class="flex gap-2" @submit.prevent="submit">
      <input
        v-model.number="value"
        data-test="sample-input"
        type="number"
        inputmode="numeric"
        :min="props.payload.lowerBound"
        :max="props.payload.upperBound"
        :disabled="props.disabled"
        class="min-h-11 w-full rounded-md border border-neutral-300 px-3"
      />
      <button
        type="submit"
        :disabled="props.disabled"
        class="min-h-11 shrink-0 rounded-md bg-neutral-900 px-4 text-white disabled:opacity-40"
      >
        Raten
      </button>
    </form>
    <p v-if="props.outcome" data-test="sample-outcome" class="mt-3 text-sm">
      {{ DIRECTIONS[props.outcome.direction] }}
      <span v-if="!props.outcome.correct">Abstand: {{ props.outcome.distance }}.</span>
    </p>
  </div>
</template>
