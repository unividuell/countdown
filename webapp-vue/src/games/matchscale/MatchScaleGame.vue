<script setup lang="ts">
/**
 * Augenmaß: which card the round is on, and the one place `unknown` becomes typed. The board
 * until the server reveals the factor, then the reveal.
 */
import { computed, ref, watch } from 'vue'
import { useAuth } from '@/auth/useAuth'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { useMyColorHex } from '@/games/useMyColorHex'
import { useRevealedLive } from '@/games/useRevealedLive'
import { clearDraft, deviceStorage, draftKey } from './draft'
import MatchScaleBoard from './MatchScaleBoard.vue'
import MatchScaleReveal from './MatchScaleReveal.vue'
import { myWin, scoreboardRows } from './scoreboard'
import type { Submitted } from './gestures'
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

const rows = computed(() =>
  solution.value === null
    ? []
    : scoreboardRows({
        entries: props.entries,
        factor: solution.value.factor,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
      }),
)

/** The reveal's verdict sound: my tip in the gate, or (phase two) my row holding the points. */
const won = computed(() =>
  payload.value === null
    ? null
    : myWin({
        toleranceFactor: payload.value.toleranceFactor,
        outcome: props.outcome,
        rows: rows.value,
        mineUserId: props.mineUserId,
      }),
)

/** „Live“ is the round's rule, not a per-row question — the rows carry their own `provisional`. */
const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

const animate = useRevealedLive(() => solution.value !== null)

/** The board as the tip left it: the board is gone by the reveal, and the draft with it. */
const submitted = ref<Submitted | null>(null)

function onGuess(value: { scale: number }, from: Submitted): void {
  submitted.value = from
  emit('guess', value)
}
</script>

<template>
  <p v-if="payload === null" class="text-sm text-on-surface-variant">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <MatchScaleReveal
    v-else-if="solution"
    :payload="payload"
    :factor="solution.factor"
    :my-scale="myScale"
    :my-color-hex="myColorHex"
    :mine-user-id="props.mineUserId"
    :rows="rows"
    :won="won"
    :live="live"
    :animate="animate"
    :from="submitted"
  />
  <MatchScaleBoard
    v-else
    :payload="payload"
    :disabled="props.disabled"
    :draft-key="key"
    :award-rule="props.awardRule"
    :award-points="props.awardPoints"
    :my-color-hex="myColorHex"
    @guess="onGuess"
  />
</template>
