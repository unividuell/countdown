<script setup lang="ts">
/**
 * The card after the round: the same quote, the wheel as a picture, and the scoreboard under it.
 *
 * The table's box is complete from the moment this card mounts — nothing under the wheel moves
 * afterwards, only its ink appears. That is why the card grows exactly once, during the crossfade
 * both cards share a grid cell for, and never again.
 *
 * When the solution appears, a knocked verdict says whether my hue made it — only on a reveal that
 * just happened here, never on a reload. The other markers land after it in silence: the verdict
 * is the last sound.
 *
 *   0 ─── 900 ms ──────────────── 1450 ms ── +120 ── +120 ──▶
 *         sector, verdict, my row   marker     marker  marker
 */
import GuessHueScoreboard from './GuessHueScoreboard.vue'
import HueWheelReveal from './HueWheelReveal.vue'
import type { RevealGuess } from './reveal'
import type { ScoreboardRow, ScoreboardSolution } from './scoreboard'
import { provideRevealTimeline } from '@/games/revealTimeline'
import { useSoundStage } from '@/ui/useSoundAwake'

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

provideRevealTimeline({ animate: props.animate, won: () => props.won })

/** Its verdict is governed by the header's sound switch, which wakes the graph while it is here. */
useSoundStage()
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
      />
    </div>

    <div class="mt-6">
      <GuessHueScoreboard :rows="props.rows" :solution="props.solutionCell" :live="props.live" />
    </div>
  </div>
</template>
