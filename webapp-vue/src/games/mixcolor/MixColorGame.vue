<script setup lang="ts">
/**
 * Anrührung: the board until the server reveals the recipe, then the reveal. The one place
 * `unknown` becomes typed.
 */
import { computed } from 'vue'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { useMyColorHex } from '@/games/useMyColorHex'
import { useRevealedLive } from '@/games/useRevealedLive'
import { myWin } from '@/games/verdict'
import MixColorBoard from './MixColorBoard.vue'
import MixColorReveal from './MixColorReveal.vue'
import { scoreboardRows } from './scoreboard'
import { asMixColorOutcome, asMixColorPayload, asMixColorSolution } from './types'

const props = defineProps<GameProps>()

const emit = defineEmits<GameEmits>()

const payload = computed(() => asMixColorPayload(props.payload))
const solution = computed(() => asMixColorSolution(props.solution))

const myColorHex = useMyColorHex(
  () => props.entries,
  () => props.mineUserId,
)

const rows = computed(() =>
  scoreboardRows({
    entries: props.entries,
    awardRule: props.awardRule,
    mineUserId: props.mineUserId,
  }),
)

/** „Live“ is the round's rule — the rows carry their own `provisional`. */
const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

const won = computed(() =>
  payload.value === null
    ? null
    : myWin({
        gated: !live.value,
        withinGate: asMixColorOutcome(props.outcome)?.withinTolerance ?? null,
        rows: rows.value,
        mineUserId: props.mineUserId,
      }),
)

const animate = useRevealedLive(() => solution.value !== null)
</script>

<template>
  <p v-if="payload === null" class="text-sm text-on-surface-variant">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <MixColorReveal
    v-else-if="solution"
    :payload="payload"
    :solution="solution"
    :rows="rows"
    :mine-user-id="props.mineUserId"
    :won="won"
    :live="live"
    :animate="animate"
  />
  <MixColorBoard
    v-else
    :payload="payload"
    :steps="props.steps ?? []"
    :disabled="props.disabled"
    :award-rule="props.awardRule"
    :award-points="props.awardPoints"
    :my-color-hex="myColorHex"
    @skip="(stage, input) => emit('skip', stage, input)"
    @guess="(value) => emit('guess', value)"
  />
</template>
