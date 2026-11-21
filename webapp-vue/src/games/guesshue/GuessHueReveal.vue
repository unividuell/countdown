<script setup lang="ts">
/**
 * The card after the round: the same quote, the wheel as a picture, and the scoreboard under it.
 *
 * The table's box is complete from the moment this card mounts — nothing under the wheel moves
 * afterwards, only its ink appears. That is why the card grows exactly once, during the crossfade
 * both cards share a grid cell for, and never again.
 *
 * When the solution appears, a knocked verdict says whether my hue made it, and every other
 * player's marker lands with a knock of its own — only on a reveal that just happened here, never
 * on a reload.
 *
 *   0 ─── 900 ms ─────────── 1945 ms ── +120 ── +120 ──▶
 *         solution, verdict   marker     marker  marker
 */
import { onBeforeUnmount, onMounted } from 'vue'
import GuessHueScoreboard from './GuessHueScoreboard.vue'
import HueWheelReveal from './HueWheelReveal.vue'
import type { RevealGuess } from './reveal'
import { playMarker } from './turnSound'
import type { ScoreboardRow, ScoreboardSolution } from './scoreboard'
import { isStill } from '@/games/revealChoreography'
import { useRevealVerdict } from '@/games/useRevealVerdict'
import { inBackground } from '@/ui/motion'
import SoundToggle from '@/ui/SoundToggle.vue'

const props = defineProps<{
  description: string
  saturation: number
  lightness: number
  targetHue: number
  toleranceDeg: number
  guesses: RevealGuess[]
  mineUserId: string | null
  animate: boolean
  rows: ScoreboardRow[]
  solutionCell: ScoreboardSolution
  /** Which verdict the solution's beat plays: `null` plays none. */
  won: boolean | null
  live: boolean
}>()

useRevealVerdict(() => props.won, props.animate)

let landings: ReturnType<typeof setTimeout>[] = []

onMounted(() => {
  // All markers at once would be one loud knock that says nothing.
  if (!props.animate || inBackground() || isStill(props.animate)) return

  // Mine is the knob, already there: it does not land.
  landings = props.guesses
    .filter((guess) => guess.userId !== props.mineUserId)
    .map((guess) => setTimeout(playMarker, guess.revealDelayMs))
})

onBeforeUnmount(() => {
  landings.forEach(clearTimeout)
})
</script>

<template>
  <div data-test="hue-reveal">
    <blockquote class="border-l-4 border-outline py-1 pl-4">
      <p
        data-test="hue-description"
        class="text-xl leading-relaxed font-medium text-on-surface italic select-none"
      >
        „{{ props.description }}“
      </p>
    </blockquote>

    <div class="relative mt-6">
      <HueWheelReveal
        :saturation="props.saturation"
        :lightness="props.lightness"
        :target-hue="props.targetHue"
        :tolerance-deg="props.toleranceDeg"
        :guesses="props.guesses"
        :mine-user-id="props.mineUserId"
        :animate="props.animate"
      />
      <!-- Where the board has it, so it does not jump at the switch. -->
      <SoundToggle
        class="absolute top-0 right-0 flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface-container text-on-surface"
      />
    </div>

    <div class="mt-6">
      <GuessHueScoreboard
        :rows="props.rows"
        :solution="props.solutionCell"
        :live="props.live"
        :animate="props.animate"
      />
    </div>
  </div>
</template>
