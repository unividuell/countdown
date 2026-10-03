<script setup lang="ts">
/**
 * Entstauber: which card the round is on, and the one place `unknown` becomes typed.
 *
 * `skip` and `giveUp` are declared but never emitted — one stage, one attempt, and both exits are
 * the framework's. `solution` is declared and never read: the photo under the dust is the reward,
 * and it comes through the scene asset, not through a solution exit.
 */
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import DedusterBoard from './DedusterBoard.vue'
import DedusterReveal from './DedusterReveal.vue'
import { scoreRows } from './scoreboard'
import { SCENE_ASSET_KEY, asDedusterGuess, asDedusterPayload, asDedusterScene } from './types'

const props = defineProps<{
  payload: unknown
  outcome: unknown
  myGuess: unknown
  solution: unknown
  entries: GameEntry[]
  mineUserId: string | null
  awardRule: AwardRule | null
  awardPoints: number | null
  disabled: boolean
  stage?: number
  assetUrl?: (key: number) => string
  closed?: boolean
  sealed?: boolean
  scene?: unknown
}>()

const emit = defineEmits<{ guess: [unknown]; skip: [number]; giveUp: []; reveal: [] }>()

const payload = computed(() => asDedusterPayload(props.payload))
const scene = computed(() => asDedusterScene(props.scene))
const myGuess = computed(() => asDedusterGuess(props.myGuess))
const photoUrl = computed(() => props.assetUrl?.(SCENE_ASSET_KEY) ?? null)
const done = computed(() => props.closed === true || myGuess.value !== null)

const rows = computed(() =>
  payload.value === null
    ? []
    : scoreRows({
        entries: props.entries,
        tiles: payload.value.cols * payload.value.rows,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
      }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

/** As in Musterung: the table's cascade plays only when the evaluation arrives here, not on reload. */
const hasRevealedLive = ref(false)
watch(done, (now, before) => {
  if (!before && now) hasRevealedLive.value = true
})
</script>

<template>
  <p
    v-if="photoUrl === null || (payload === null && scene === null)"
    class="text-sm text-neutral-600"
  >
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <DedusterReveal
    v-else-if="done && payload"
    :payload="payload"
    :photo-url="photoUrl"
    :rows="rows"
    :live="live"
    :animate="hasRevealedLive"
  />
  <DedusterBoard
    v-else
    :payload="payload"
    :scene="scene"
    :sealed="props.sealed === true"
    :disabled="props.disabled"
    :submitted="myGuess !== null"
    :photo-url="photoUrl"
    :award-rule="props.awardRule"
    :award-points="props.awardPoints"
    @guess="(value) => emit('guess', value)"
    @reveal="emit('reveal')"
  />
</template>
