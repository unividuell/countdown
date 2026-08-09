<script setup lang="ts">
/**
 * Guess Hue in the lab: which card the round is on, and the two things only the lab needs — the
 * guess wrapped into the shape the endpoint takes, and the server's `unknown`s narrowed to numbers.
 *
 * The switch lives here rather than in the board because this is the place that turns `unknown`
 * into typed values. `myGuess` stays beside `entries` even though it is derivable from it: it has
 * its own documented job — the wheel's starting angle after a reload — and `SampleGame` hangs off
 * the same prop.
 */
import { computed } from 'vue'
import GuessHueBoard from '@/games/guesshue/GuessHueBoard.vue'
import GuessHueReveal from '@/games/guesshue/GuessHueReveal.vue'
import type { RevealGuess } from '@/games/guesshue/reveal'
import type { GuessHuePayload, GuessHueSolution, LabEntryDto } from './types'

const props = defineProps<{
  payload: GuessHuePayload
  outcome: unknown
  disabled: boolean
  /** The viewer's own stored guess, in whatever shape the game recorded it. */
  myGuess: unknown
  /** What the server revealed once the viewer had spent their guess, or `null`. */
  solution: unknown
  /** The visible entries, in the order the lab page already builds — mine first. */
  entries: LabEntryDto[]
  /** Which of them is mine. Never the position: that is a display decision. */
  mineUserId: string | null
}>()

const emit = defineEmits<{ guess: [value: unknown] }>()

/** Narrowed rather than cast: `unknown` by contract, and a stale round may be junk. */
function hueOf(guess: unknown): number | null {
  if (typeof guess !== 'object' || guess === null) return null
  const hue = (guess as { hue?: unknown }).hue
  return typeof hue === 'number' && Number.isFinite(hue) ? hue : null
}

const myHue = computed(() => hueOf(props.myGuess))

/**
 * Two finite numbers or nothing at all. Junk here leaves the input card standing, which is the
 * honest outcome — the alternative is `NaN` in a transformation matrix.
 */
const solution = computed<GuessHueSolution | null>(() => {
  const raw = props.solution
  if (typeof raw !== 'object' || raw === null) return null
  const { targetHue, toleranceDeg } = raw as { targetHue?: unknown; toleranceDeg?: unknown }
  if (typeof targetHue !== 'number' || !Number.isFinite(targetHue)) return null
  if (typeof toleranceDeg !== 'number' || !Number.isFinite(toleranceDeg)) return null
  return { targetHue, toleranceDeg }
})

/** An entry the wheel cannot place drops out of the list rather than being drawn wrong. */
const guesses = computed<RevealGuess[]>(() =>
  props.entries.flatMap((entry) => {
    const hue = hueOf(entry.guess)
    return hue === null ? [] : [{ userId: entry.userId, hue, colorHex: entry.avatar.bgColorHex }]
  }),
)

/**
 * Whether the reveal is something that *happened* here, or something that was already true when
 * this component mounted. A reload in a spent round lands on the finished picture: suspense belongs
 * to the moment of the guess, not to the load. Read once, at setup — that is exactly the question.
 */
const arrivedUnrevealed = solution.value === null
const animate = computed(() => arrivedUnrevealed && solution.value !== null)
</script>

<template>
  <!--
    One grid cell for both cards, rather than one absolutely positioned over the other: this way
    the surroundings are as tall as whichever card is taller during the crossfade, and fall to the
    reveal card's height by themselves once the outgoing one is gone.
  -->
  <div class="grid">
    <!--
      Beat 2. No `mode`, so both cards overlap: my marker sits on the same radius and the same
      angle as the knob by construction, which is what makes the crossfade read as one circle
      changing colour. No `appear`, so a reload does not replay any of it.
    -->
    <Transition
      enter-active-class="transition-opacity duration-500 delay-200 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="hue-card-leaving transition-opacity duration-300 motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <GuessHueReveal
        v-if="solution"
        class="[grid-area:1/1]"
        :description="props.payload.description"
        :saturation="props.payload.saturation"
        :lightness="props.payload.lightness"
        :target-hue="solution.targetHue"
        :tolerance-deg="solution.toleranceDeg"
        :guesses="guesses"
        :mine-user-id="props.mineUserId"
        :animate="animate"
      />
      <GuessHueBoard
        v-else
        class="[grid-area:1/1]"
        :description="props.payload.description"
        :init-hue="myHue ?? props.payload.initHue"
        :saturation="props.payload.saturation"
        :lightness="props.payload.lightness"
        :disabled="props.disabled"
        @guess="(hue: number) => emit('guess', { hue })"
      />
    </Transition>
  </div>
</template>
