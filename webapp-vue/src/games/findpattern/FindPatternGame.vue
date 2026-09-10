<script setup lang="ts">
/**
 * Musterung: which card the round is on, and the one place `unknown` becomes typed.
 *
 * `skip` and `giveUp` are declared but never emitted — this game has one stage and one attempt, and
 * both exits are the framework's, not the game's. Declaring them keeps the component contract the
 * same shape for every game the round card and the lab render.
 */
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import FindPatternBoard from './FindPatternBoard.vue'
import FindPatternReveal from './FindPatternReveal.vue'
import { scoreRows } from './scoreboard'
import { asFindPatternSolution, isFindPatternPayload, startIndexOf } from './types'

const props = defineProps<{
  payload: unknown
  outcome: unknown
  myGuess: unknown
  solution: unknown
  entries: GameEntry[]
  mineUserId: string | null
  awardRule: AwardRule | null
  disabled: boolean
  stage?: number
  assetUrl?: (key: number) => string
  /** Declared, never used here: the contract is the same shape for every game the card renders. */
  closed?: boolean
}>()

const emit = defineEmits<{ guess: [unknown]; skip: [number]; giveUp: [] }>()

const payload = computed(() => (isFindPatternPayload(props.payload) ? props.payload : null))
const solution = computed(() => asFindPatternSolution(props.solution))

/** Grey, so a player whose row has not arrived yet still sees their own selection. */
const myColorHex = computed(
  () =>
    props.entries.find((entry) => entry.userId === props.mineUserId)?.avatar.bgColorHex ??
    '#525252',
)

const rows = computed(() =>
  solution.value === null
    ? []
    : scoreRows({
        entries: props.entries,
        solution: solution.value,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
      }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

/**
 * Whether the reveal is something that just happened here rather than something that was already
 * true on mount — the same flag Guess Hue keeps, for the same reason: a reload must not replay the
 * choreography. A `watch` without `immediate` never fires for the initial value, which is what makes
 * an instance mounting already-revealed start `false`.
 */
const hasRevealedLive = ref(false)
watch(solution, (now, before) => {
  if (before === null && now !== null) hasRevealedLive.value = true
})
</script>

<template>
  <p v-if="payload === null" class="text-sm text-neutral-600">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <!--
    One grid cell for both cards, exactly as `GuessHueGame` does it and for the same reason: the
    surroundings stay as tall as whichever card is taller during the crossfade, then fall to the
    reveal's height once the outgoing one is gone.
  -->
  <div v-else class="grid">
    <!--
      Beat 2. No `mode`, so both cards overlap — the board image sits at the same place and the
      same size in each, so it reads as one field standing still while everything under it is
      exchanged. The reveal's own clearing rides these same two numbers; see `preview.ts`.
      No `appear`, so a reload does not replay any of it.
    -->
    <Transition
      enter-active-class="transition-opacity duration-500 delay-200 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-300 motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <FindPatternReveal
        v-if="solution"
        class="[grid-area:1/1]"
        :payload="payload"
        :solution="solution"
        :rows="rows"
        :mine-user-id="props.mineUserId"
        :live="live"
        :animate="hasRevealedLive"
      />
      <FindPatternBoard
        v-else
        class="[grid-area:1/1]"
        :payload="payload"
        :my-color-hex="myColorHex"
        :disabled="props.disabled"
        :submitted-start-index="startIndexOf(props.myGuess)"
        @guess="(value) => emit('guess', value)"
      />
    </Transition>
  </div>
</template>
