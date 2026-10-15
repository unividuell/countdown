<script setup lang="ts">
/**
 * Platzierung: which card the round is on, and the one place `unknown` becomes typed.
 *
 * `skip` and `giveUp` are declared but never emitted — one stage, one attempt, and both exits are the
 * framework's. Declaring them keeps the contract the same shape for every game.
 */
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import PlacePatchBoard from './PlacePatchBoard.vue'
import PlacePatchReveal from './PlacePatchReveal.vue'
import { scoreRows } from './scoreboard'
import {
  BOARD_ASSET_KEY,
  PATCH_ASSET_KEY,
  asPlacePatchPayload,
  asPlacePatchScene,
  asPlacePatchSolution,
  cellOf,
} from './types'

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
  /** Sealed: mounted under the cover before the reveal, `payload` still `null`. */
  sealed?: boolean
  /** The board's shape while sealed. */
  scene?: unknown
}>()

const emit = defineEmits<{ guess: [unknown]; skip: [number]; giveUp: []; reveal: [] }>()

const payload = computed(() => asPlacePatchPayload(props.payload))
const scene = computed(() => (props.sealed ? asPlacePatchScene(props.scene) : null))
const solution = computed(() => asPlacePatchSolution(props.solution, payload.value))

/** Only with the payload: a sealed round's pictures are forbidden, and asking would 403. */
const boardSrc = computed(() =>
  payload.value ? (props.assetUrl?.(BOARD_ASSET_KEY) ?? null) : null,
)
const patchSrc = computed(() =>
  payload.value ? (props.assetUrl?.(PATCH_ASSET_KEY) ?? null) : null,
)

/** Grey, so a player whose row has not arrived yet still sees their own stamp. */
const myColorHex = computed(
  () =>
    props.entries.find((entry) => entry.userId === props.mineUserId)?.avatar.bgColorHex ??
    '#525252',
)

const rows = computed(() =>
  solution.value === null || payload.value === null
    ? []
    : scoreRows({
        entries: props.entries,
        solution: solution.value,
        layout: payload.value,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
      }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

/** A reload must not replay the choreography — Musterung's flag, for the same reason. */
const hasRevealedLive = ref(false)
watch(solution, (now, before) => {
  if (before === null && now !== null) hasRevealedLive.value = true
})
</script>

<template>
  <p
    v-if="props.assetUrl === undefined || (payload === null && scene === null)"
    class="text-sm text-neutral-600"
  >
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <div v-else class="grid">
    <Transition
      enter-active-class="transition-opacity duration-500 delay-200 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-300 motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <PlacePatchReveal
        v-if="solution && payload && boardSrc && patchSrc"
        class="[grid-area:1/1]"
        :payload="payload"
        :solution="solution"
        :rows="rows"
        :mine-user-id="props.mineUserId"
        :live="live"
        :animate="hasRevealedLive"
        :board-src="boardSrc"
        :patch-src="patchSrc"
      />
      <PlacePatchBoard
        v-else
        class="[grid-area:1/1]"
        :payload="payload"
        :scene="scene"
        :sealed="props.sealed === true"
        :board-src="boardSrc"
        :patch-src="patchSrc"
        :my-color-hex="myColorHex"
        :disabled="props.disabled"
        :submitted="cellOf(props.myGuess, payload)"
        :award-rule="props.awardRule"
        :award-points="props.awardPoints"
        @guess="(value) => emit('guess', value)"
        @reveal="emit('reveal')"
      />
    </Transition>
  </div>
</template>
