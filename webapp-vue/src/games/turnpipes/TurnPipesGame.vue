<script setup lang="ts">
/**
 * Verrohrung: which card the round is on, and the one place `unknown` becomes typed.
 *
 * `skip` and `giveUp` are declared but never emitted — one stage, one attempt, and both exits are
 * the framework's. `scene` is read only while sealed: with the payload open, its size is the board's.
 */
import { computed, watch } from 'vue'
import { useAuth } from '@/auth/useAuth'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { useMyColorHex } from '@/games/useMyColorHex'
import { useRevealedLive } from '@/games/useRevealedLive'
import { clearDraft, deviceStorage, draftKey } from './draft'
import { scoreRows } from './scoreboard'
import TurnPipesBoard from './TurnPipesBoard.vue'
import TurnPipesReveal from './TurnPipesReveal.vue'
import {
  asTurnPipesGuess,
  asTurnPipesOutcome,
  asTurnPipesPayload,
  asTurnPipesScene,
  asTurnPipesSolution,
} from './types'

const props = defineProps<GameProps>()

const emit = defineEmits<GameEmits>()

const { user } = useAuth()

const payload = computed(() => asTurnPipesPayload(props.payload))
const scene = computed(() => (props.sealed === true ? asTurnPipesScene(props.scene) : null))
const myGuess = computed(() => asTurnPipesGuess(props.myGuess))
const myOutcome = computed(() => asTurnPipesOutcome(props.outcome))
const solution = computed(() => asTurnPipesSolution(props.solution))
const done = computed(() => props.closed === true || myGuess.value !== null)

const rows = computed(() =>
  scoreRows({
    entries: props.entries,
    awardRule: props.awardRule,
    mineUserId: props.mineUserId,
    size: payload.value?.size ?? null,
  }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

/** Without a player or a payload (sealed) there is nothing to key a draft by. */
const key = computed(() => {
  const userId = user.value?.id
  if (userId === undefined || payload.value === null) return null

  return draftKey({ userId, payload: payload.value, timed: live.value })
})

// The tip is in: the draft has served. Immediate, so a reload onto a played round drops it too.
watch(
  [myGuess, key],
  ([guess, draft]) => {
    if (guess !== null && draft !== null) clearDraft(deviceStorage(), draft)
  },
  { immediate: true },
)

const hasRevealedLive = useRevealedLive(done)

const myColorHex = useMyColorHex(
  () => props.entries,
  () => props.mineUserId,
)
</script>

<template>
  <p v-if="!props.sealed && payload === null" class="text-sm text-on-surface-variant">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <TurnPipesReveal
    v-else-if="done && payload"
    :payload="payload"
    :solution="solution"
    :rows="rows"
    :mine-user-id="props.mineUserId"
    :my-rotations="myGuess?.rotations ?? null"
    :my-outcome="myOutcome"
    :live="live"
    :animate="hasRevealedLive"
  />
  <TurnPipesBoard
    v-else
    :payload="payload"
    :scene="scene"
    :sealed="props.sealed === true"
    :disabled="props.disabled"
    :draft-key="key"
    :award-rule="props.awardRule"
    :award-points="props.awardPoints"
    :my-color-hex="myColorHex"
    @guess="(value) => emit('guess', value)"
    @reveal="emit('reveal')"
  />
</template>
