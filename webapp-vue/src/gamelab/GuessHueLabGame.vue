<script setup lang="ts">
/**
 * Guess Hue in the lab: the board plus the two things only the lab needs — the guess wrapped into
 * the shape the endpoint takes, and a provisional card showing what was submitted.
 *
 * That card lives here rather than in the board on purpose. Standing beside the game rather than
 * inside it says by itself that it does not belong, and living in the lab adapter means it
 * disappears together with the lab instead of by documentation. The real view after a round is a
 * separate subject and will replace it.
 */
import { computed } from 'vue'
import GuessHueBoard from '@/games/guesshue/GuessHueBoard.vue'
import type { GuessHuePayload } from './types'

const props = defineProps<{
  payload: GuessHuePayload
  outcome: unknown
  disabled: boolean
  /** The viewer's own stored guess, in whatever shape the game recorded it. */
  myGuess: unknown
}>()

const emit = defineEmits<{ guess: [value: unknown] }>()

/** Narrowed rather than cast: the prop is `unknown` by contract, and a stale round may be junk. */
const myHue = computed(() => {
  const guess = props.myGuess
  if (typeof guess !== 'object' || guess === null) return null
  const hue = (guess as { hue?: unknown }).hue
  return typeof hue === 'number' ? hue : null
})
</script>

<template>
  <GuessHueBoard
    :description="props.payload.description"
    :init-hue="myHue ?? props.payload.initHue"
    :saturation="props.payload.saturation"
    :lightness="props.payload.lightness"
    :disabled="props.disabled"
    @guess="(hue: number) => emit('guess', { hue })"
  />

  <!-- Lab scaffolding with an expiry date. It may vanish without replacement. -->
  <div
    v-if="myHue !== null"
    data-test="lab-guess-card"
    class="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4"
  >
    <p class="text-sm text-neutral-600">
      Dein Tipp steht: <strong class="text-neutral-900">{{ Math.round(myHue) }}°</strong>
    </p>
    <p class="mt-1 text-xs text-neutral-400">
      Vorläufige Labor-Anzeige — die Ansicht nach der Abgabe wird noch gebaut.
    </p>
  </div>
</template>
