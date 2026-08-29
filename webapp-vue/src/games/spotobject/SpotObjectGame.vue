<script setup lang="ts">
/**
 * Weltanschauung: which card the round is on, and the one place `unknown` becomes typed.
 *
 * Unlike Musterung this game has no solution to watch for — there is no round secret at all. The
 * switch is the viewer's own finished entry, which is exactly the condition the server gates
 * `others` on: once I have a guess, everyone's tips are visible and the reveal is what shows them.
 */
import { computed, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import SpotObjectBoard from './SpotObjectBoard.vue'
import SpotObjectReveal from './SpotObjectReveal.vue'
import { scoreRows, tipTiles } from './tips'
import { isSpotObjectPayload } from './types'

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
  canOverride?: boolean
  tipPath: (userId: string) => RouteLocationRaw
}>()

const emit = defineEmits<{ guess: [unknown]; skip: [number]; giveUp: [] }>()

const payload = computed(() => (isSpotObjectPayload(props.payload) ? props.payload : null))

const mine = computed(
  () => props.entries.find((entry) => entry.userId === props.mineUserId) ?? null,
)
const played = computed(() => mine.value !== null && mine.value.guess !== null)

const tiles = computed(() => tipTiles({ entries: props.entries, mineUserId: props.mineUserId }))
const rows = computed(() =>
  scoreRows({ entries: props.entries, awardRule: props.awardRule, mineUserId: props.mineUserId }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

/**
 * Whether the reveal is something that just happened here rather than something that was already
 * true on mount — the same flag every other game's reveal keeps. A `watch` without `immediate`
 * never fires for the initial value, which is what makes an instance mounting already-played
 * start `false` instead of replaying the choreography.
 */
const hasRevealedLive = ref(false)
watch(played, (now, before) => {
  if (!before && now) hasRevealedLive.value = true
})
</script>

<template>
  <p v-if="payload === null" class="text-sm text-neutral-600">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <SpotObjectReveal
    v-else-if="played"
    :tiles="tiles"
    :rows="rows"
    :live="live"
    :animate="hasRevealedLive"
    :tip-path="props.tipPath"
  />
  <SpotObjectBoard
    v-else
    :payload="payload"
    :disabled="props.disabled"
    @guess="(value) => emit('guess', value)"
  />
</template>
