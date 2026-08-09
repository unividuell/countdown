<script setup lang="ts">
/**
 * The card after the round: the same quote, and the wheel as a picture.
 *
 * **Nothing under it.** The input card's rule is wrong here, and a line of numbers would be a
 * stand-in for the detail table that belongs in that space — which is its own cut. So the card
 * gets *shorter* at the switch, and much longer again later. That is the decision, not a side
 * effect: pulling in a line just to keep the height would build a line that disappears again.
 */
import HueWheelReveal from './HueWheelReveal.vue'
import type { RevealGuess } from './reveal'

const props = defineProps<{
  description: string
  saturation: number
  lightness: number
  targetHue: number
  toleranceDeg: number
  guesses: RevealGuess[]
  mineUserId: string | null
  animate: boolean
}>()
</script>

<template>
  <div class="rounded-xl border border-neutral-200 bg-white p-4">
    <blockquote class="border-l-4 border-neutral-300 py-1 pl-4">
      <p
        data-test="hue-description"
        class="text-xl leading-relaxed font-medium text-neutral-900 italic select-none"
      >
        „{{ props.description }}“
      </p>
    </blockquote>

    <div class="mt-6">
      <HueWheelReveal
        :saturation="props.saturation"
        :lightness="props.lightness"
        :target-hue="props.targetHue"
        :tolerance-deg="props.toleranceDeg"
        :guesses="props.guesses"
        :mine-user-id="props.mineUserId"
        :animate="props.animate"
      />
    </div>
  </div>
</template>
