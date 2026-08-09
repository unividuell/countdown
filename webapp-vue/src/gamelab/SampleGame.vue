<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SampleOutcome, SamplePayload } from './types'

/**
 * The three reveal props are part of the lab's component contract and this game wants none of
 * them. Undeclared props fall through as attributes, and an array of entries would land in the DOM
 * as `entries="[object Object]"`.
 */
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  payload: SamplePayload
  outcome: SampleOutcome | null
  disabled: boolean
  myGuess: unknown
}>()
const emit = defineEmits<{ guess: [value: unknown] }>()

function storedValue(guess: unknown): number | null {
  if (typeof guess !== 'object' || guess === null) return null
  const value = (guess as { value?: unknown }).value
  // Matches the same guard in `GuessHueLabGame.vue`: a stale round could hand back `NaN`, and
  // `typeof NaN === 'number'` lets it straight through to the input.
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const value = ref<number | null>(storedValue(props.myGuess))
// The lab page keeps this component mounted across a seed change — only the props change, not the
// instance — so the prefill must follow `myGuess` rather than snapshot it once, or a new round
// would keep showing the previous round's guess.
watch(
  () => props.myGuess,
  (guess) => {
    value.value = storedValue(guess)
  },
)

const DIRECTIONS: Record<SampleOutcome['direction'], string> = {
  HIGHER: 'Die gesuchte Zahl ist größer.',
  LOWER: 'Die gesuchte Zahl ist kleiner.',
  EXACT: 'Genau getroffen.',
}

function submit(): void {
  // v-model.number on a cleared <input type="number"> yields '', not null — a plain `=== null`
  // guard lets that through and the empty guess round-trips to the server as a generic failure.
  if (typeof value.value !== 'number') return
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
