<script setup lang="ts">
/**
 * Kreativverhältnis: which card the round is on, and the one place `unknown` becomes typed.
 *
 *   board ──(solution arrives)──▶ reveal
 *
 * No cover: the picture's key comes with the open round, so the board is playable at once. A closed
 * round shows the reveal as soon as the server sends the solution, whether or not I painted.
 *
 * `skip`, `giveUp` and `reveal` are declared but never emitted — one stage, one attempt, and the
 * exits are the framework's. `scene` and `sealed` are never read: there is no cover.
 *
 * The draft's housekeeping lives here, not in the board, which only loads and saves its key.
 */
import { computed, watch } from 'vue'
import { clearDraft, deviceStorage, sweepDrafts } from '@/games/drafts'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { useMyColorHex } from '@/games/useMyColorHex'
import { useRevealedLive } from '@/games/useRevealedLive'
import { useSealedAsset } from '@/ui/useSealedAsset'
import { draftKey, draftPrefix } from './draft'
import PaintRatioBoard from './PaintRatioBoard.vue'
import PaintRatioReveal from './PaintRatioReveal.vue'
import { scoreRows } from './scoreboard'
import { asPaintRatioPayload, asPaintRatioSolution } from './types'

const TARGET_ASSET = 'target'

const props = defineProps<GameProps>()

const emit = defineEmits<GameEmits>()

const payload = computed(() => asPaintRatioPayload(props.payload))
const solution = computed(() => asPaintRatioSolution(props.solution))
const solved = computed(() => solution.value !== null)

const { state: pictureState, src: templateSrc } = useSealedAsset(() => props.assets, TARGET_ASSET)

const pictureFailed = computed(() => pictureState.value === 'failed')

const myColorHex = useMyColorHex(
  () => props.entries,
  () => props.mineUserId,
)

/**
 * Where my painting is kept on this device. The target's address names the round (the payload is
 * the same for every round); without a player or assets there is nothing to key by, and the board
 * plays without a draft.
 */
const key = computed(() => {
  if (props.mineUserId === null || props.assets === undefined) return null

  return draftKey({ userId: props.mineUserId, assetUrl: props.assets.url(TARGET_ASSET) })
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

// The painting has served: drop it. Immediate, so a reload into a solved round drops it too.
watch(
  [solved, key],
  ([done, current]) => {
    if (done && current !== null) clearDraft(deviceStorage(), current)
  },
  { immediate: true },
)

/** Only the reveal reads it, so no one's strokes are parsed while the board is up. */
const rows = computed(() =>
  payload.value === null
    ? []
    : scoreRows({
        entries: props.entries,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
        brushCount: payload.value.brushes.length,
      }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

const animate = useRevealedLive(solved)
</script>

<template>
  <p v-if="payload === null" class="text-sm text-neutral-600">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <div v-else-if="solution !== null" class="flex flex-col gap-6">
    <!-- Above the picture: the card's top edge is where the eye lands, the table can be far below. -->
    <p v-if="pictureFailed" class="text-center text-sm text-red-700">
      Das Bild ließ sich nicht laden.
    </p>
    <PaintRatioReveal
      :payload="payload"
      :solution="solution"
      :template-src="templateSrc"
      :rows="rows"
      :live="live"
      :animate="animate"
      :mine-user-id="props.mineUserId"
    />
  </div>
  <PaintRatioBoard
    v-else
    :payload="payload"
    :template-src="templateSrc"
    :picture-failed="pictureFailed"
    :my-color-hex="myColorHex"
    :draft-key="key"
    :disabled="props.disabled"
    :award-rule="props.awardRule"
    :award-points="props.awardPoints"
    @guess="(guess) => emit('guess', guess)"
  />
</template>
