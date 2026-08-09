<script setup lang="ts">
/**
 * Guess Hue in the lab: the board plus the one thing only the lab needs — the guess wrapped into
 * the shape the endpoint takes.
 *
 * What was submitted is no longer shown here: the lab's entries list is the one place guesses
 * appear, including the viewer's own. `myGuess` still matters to this adapter, though — it is what
 * gives the wheel its starting angle after a reload in a round the viewer has already spent.
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
  return typeof hue === 'number' && Number.isFinite(hue) ? hue : null
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
</template>
