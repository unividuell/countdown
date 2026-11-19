<script setup lang="ts">
/**
 * Augenmessung: which card the round is on, and the one place `unknown` becomes typed. The board
 * until the server reveals the factor, then the reveal.
 */
import { computed, watch } from 'vue'
import { useAuth } from '@/auth/useAuth'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { useMyColorHex } from '@/games/useMyColorHex'
import { clearDraft, deviceStorage, draftKey } from './draft'
import MatchScaleBoard from './MatchScaleBoard.vue'
import { formatFactor } from './scoreboard'
import { asMatchScalePayload, asMatchScaleSolution, scaleOf } from './types'

const props = defineProps<GameProps>()

const emit = defineEmits<GameEmits>()

const { user } = useAuth()

const payload = computed(() => asMatchScalePayload(props.payload))
const solution = computed(() => asMatchScaleSolution(props.solution))
const myScale = computed(() => scaleOf(props.myGuess))

/** Without a player there is nothing to key a draft by. */
const key = computed(() => {
  const userId = user.value?.id
  if (userId === undefined || payload.value === null) return null

  return draftKey({ userId, payload: payload.value, timed: props.awardRule === 'CLOSEST_ONLY' })
})

// The tip is in: the draft has served. Immediate, so a reload onto a played round drops it too.
watch(
  [myScale, key],
  ([scale, draft]) => {
    if (scale !== null && draft !== null) clearDraft(deviceStorage(), draft)
  },
  { immediate: true },
)

const myColorHex = useMyColorHex(
  () => props.entries,
  () => props.mineUserId,
)
</script>

<template>
  <p v-if="payload === null" class="text-sm text-on-surface-variant">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <p v-else-if="solution" data-test="match-scale-solved" class="text-sm text-on-surface-variant">
    Tatsächlich: {{ formatFactor(solution.factor) }}×
  </p>
  <MatchScaleBoard
    v-else
    :payload="payload"
    :disabled="props.disabled"
    :draft-key="key"
    :award-rule="props.awardRule"
    :award-points="props.awardPoints"
    :my-color-hex="myColorHex"
    @guess="(value) => emit('guess', value)"
  />
</template>
