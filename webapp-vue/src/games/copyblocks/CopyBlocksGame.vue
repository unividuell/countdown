<script setup lang="ts">
/**
 * Blockierung: which card the round is on, and the one place `unknown` becomes typed.
 *
 * `skip` and `giveUp` are declared but never emitted — one stage, one attempt, and both exits are
 * the framework's. `solution` and `scene` are declared and never read: the judged outcome carries
 * everything the reveal draws, and the sealed board needs no shape.
 */
import { computed, ref, watch } from 'vue'
import { useAuth } from '@/auth/useAuth'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { useRevealedLive } from '@/games/useRevealedLive'
import CopyBlocksBoard from './CopyBlocksBoard.vue'
import CopyBlocksReveal from './CopyBlocksReveal.vue'
import { clearDraft, deviceStorage, draftKey } from './draft'
import { scoreRows } from './scoreboard'
import { asCopyBlocksGuess, asCopyBlocksOutcome, asCopyBlocksPayload } from './types'
import { START_CAMERA } from './view'
import type { Camera } from './view'

const props = defineProps<GameProps>()

const emit = defineEmits<GameEmits>()

const { user } = useAuth()

const payload = computed(() => asCopyBlocksPayload(props.payload))
const myGuess = computed(() => asCopyBlocksGuess(props.myGuess))
const myOutcome = computed(() => asCopyBlocksOutcome(props.outcome))
const done = computed(() => props.closed === true || myGuess.value !== null)

const rows = computed(() =>
  scoreRows({
    entries: props.entries,
    awardRule: props.awardRule,
    mineUserId: props.mineUserId,
    templateSize: payload.value?.blocks.length ?? null,
  }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

/** Kept here, not in the board: the reveal opens at the angle of the submission. */
const camera = ref<Camera>({ ...START_CAMERA })

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
</script>

<template>
  <p v-if="!props.sealed && payload === null" class="text-sm text-neutral-600">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <CopyBlocksReveal
    v-else-if="done && payload"
    v-model:camera="camera"
    :payload="payload"
    :rows="rows"
    :mine-user-id="props.mineUserId"
    :my-guess="myGuess?.blocks ?? null"
    :my-outcome="myOutcome"
    :live="live"
    :animate="hasRevealedLive"
  />
  <CopyBlocksBoard
    v-else
    v-model:camera="camera"
    :payload="payload"
    :sealed="props.sealed === true"
    :disabled="props.disabled"
    :draft-key="key"
    :award-rule="props.awardRule"
    :award-points="props.awardPoints"
    @guess="(value) => emit('guess', value)"
    @reveal="emit('reveal')"
  />
</template>
