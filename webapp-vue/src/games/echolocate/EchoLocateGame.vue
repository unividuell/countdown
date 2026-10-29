<script setup lang="ts">
/**
 * Peilung: which card the round is on, and the one place `unknown` becomes typed.
 *
 *   board ──(solution arrives)──▶ reveal
 *
 * The cover is the board's own: it waits for a click, because iOS starts audio only from one. A
 * closed round shows the reveal as soon as the server sends the solution, whether or not I played.
 *
 * `giveUp` and `reveal` are declared but never emitted — the exits are the framework's. `skip` is a
 * ping: the board emits it, and the answer comes back as a step. `scene` and `sealed` are never
 * read: there is no cover of the framework's.
 *
 * Clips are opened here, one asset per clip. A clip that is missing or fails to open leaves its
 * place `null`, and the board plays on without it.
 *
 * The draft's housekeeping lives here, not in the board, which only loads and saves its key.
 */
import { computed, watch } from 'vue'
import { clearDraft, deviceStorage, sweepDrafts } from '@/games/drafts'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { useRevealedLive } from '@/games/useRevealedLive'
import { useSealedAsset } from '@/ui/useSealedAsset'
import { draftKey, draftPrefix } from './draft'
import EchoLocateBoard from './EchoLocateBoard.vue'
import EchoLocateReveal from './EchoLocateReveal.vue'
import { scoreRows } from './scoreboard'
import { asEchoLocatePayload, asEchoLocateSolution } from './types'

const FIRST_CLIP = 'clip-0'
const SECOND_CLIP = 'clip-1'

const props = defineProps<GameProps>()

const emit = defineEmits<GameEmits>()

const payload = computed(() => asEchoLocatePayload(props.payload))
const solution = computed(() => asEchoLocateSolution(props.solution))
const solved = computed(() => solution.value !== null)

/**
 * Only the board plays a clip: a reveal, a history card or a payload that cannot be read would
 * fetch and decrypt bytes nobody hears. A solution that arrives lets them go again.
 */
const assets = computed(() => (payload.value !== null && !solved.value ? props.assets : undefined))

const first = useSealedAsset(() => assets.value, FIRST_CLIP)

// With one clip there is no second asset to ask for.
const second = useSealedAsset(
  () => (payload.value?.clips === 2 ? assets.value : undefined),
  SECOND_CLIP,
)

/** One place per clip, `null` while its bytes load or when they fail: that place stays silent. */
const clipSrcs = computed(() =>
  payload.value?.clips === 2 ? [first.src.value, second.src.value] : [first.src.value],
)

/**
 * Where my rings and pins are kept on this device. The first clip's address names the round (the
 * payload does not tell rounds apart); without a player or assets there is nothing to key by, and
 * the board plays without a draft. The board reads the draft once, so the key must be final here.
 */
const key = computed(() => {
  if (props.mineUserId === null || props.assets === undefined) return null

  return draftKey({ userId: props.mineUserId, assetUrl: props.assets.url(FIRST_CLIP) })
})

// Opening a round drops my stale drafts of other rounds — once the player and the round are known.
watch(
  [() => props.mineUserId, key],
  ([userId, current]) => {
    if (userId !== null && current !== null)
      sweepDrafts(deviceStorage(), draftPrefix(userId), current)
  },
  { immediate: true },
)

// The guess is in: drop the draft. Immediate, so a reload into a solved round drops it too.
watch(
  [solved, key],
  ([done, current]) => {
    if (done && current !== null) clearDraft(deviceStorage(), current)
  },
  { immediate: true },
)

/** Only the reveal reads it, so no one's guess is parsed while the board is up. */
const rows = computed(() =>
  payload.value === null
    ? []
    : scoreRows({
        entries: props.entries,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
        payload: payload.value,
      }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

const animate = useRevealedLive(solved)
</script>

<template>
  <p v-if="payload === null" class="text-sm text-neutral-600">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <EchoLocateReveal
    v-else-if="solution !== null"
    :payload="payload"
    :solution="solution"
    :rows="rows"
    :live="live"
    :animate="animate"
    :mine-user-id="props.mineUserId"
  />
  <EchoLocateBoard
    v-else
    :payload="payload"
    :steps="props.steps ?? []"
    :clip-srcs="clipSrcs"
    :draft-key="key"
    :disabled="props.disabled"
    :award-rule="props.awardRule"
    :award-points="props.awardPoints"
    @guess="(guess) => emit('guess', guess)"
    @skip="(stage, input) => emit('skip', stage, input)"
  />
</template>
