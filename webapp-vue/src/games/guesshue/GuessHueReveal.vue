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
import { onBeforeUnmount, onMounted, watch } from 'vue'
import GuessHueScoreboard from './GuessHueScoreboard.vue'
import HueWheelReveal from './HueWheelReveal.vue'
import type { RevealGuess } from './reveal'
import { playMarker } from './turnSound'
import type { ScoreboardRow, ScoreboardSolution } from './scoreboard'
import { SOLUTION_DELAY_MS, isStill } from '@/games/revealChoreography'
import { inBackground } from '@/ui/motion'
import SoundToggle from '@/ui/SoundToggle.vue'
import { useGameSound } from '@/ui/useGameSound'
import { playVerdict, type Verdict } from '@/ui/verdictSound'

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

const sound = useGameSound()
let beat: ReturnType<typeof setTimeout> | undefined
let landings: ReturnType<typeof setTimeout>[] = []
let verdict: Verdict | null = null

onMounted(() => {
  if (!props.animate || inBackground()) return

  // Where nothing moves the solution is there from the start, and so is its verdict.
  const still = isStill(props.animate)
  beat = setTimeout(
    () => {
      if (sound.value && props.won !== null) verdict = playVerdict(props.won)
    },
    still ? 0 : SOLUTION_DELAY_MS,
  )

  // All markers at once would be one loud knock that says nothing.
  if (still) return

  // Mine is the knob, already there: it does not land.
  landings = props.guesses
    .filter((guess) => guess.userId !== props.mineUserId)
    .map((guess) =>
      setTimeout(() => {
        if (sound.value) playMarker()
      }, guess.revealDelayMs),
    )
})

// Muting silences the verdict that is already sounding, not only the next one.
watch(sound, (on) => {
  if (!on) verdict?.stop()
})

onBeforeUnmount(() => {
  clearTimeout(beat)
  landings.forEach(clearTimeout)
  verdict?.stop()
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
