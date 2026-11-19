<script setup lang="ts">
/**
 * Peilung: which card the round is on, and the one place `unknown` becomes typed.
 *
 *   [sealed: empty field under the shared cover ──hold──▶ reveal] ──▶ board ──(solution)──▶ reveal
 *
 * Phase two is sealed: the cover names the count from the scene, and its hold asks for the
 * reveal — the clock starts there. The board then opens straight away; its first click is the
 * first ping, and that click starts the sound too, because iOS starts audio only from one. A closed
 * round shows the reveal as soon as the server sends the solution, whether or not I played.
 *
 * `giveUp` is declared but never emitted — that exit is the framework's. `skip` is a ping: the
 * board emits it, and the answer comes back as a step.
 *
 * Clips are opened here, one asset per clip. A clip that is missing or fails to open leaves its
 * place `null`, and the board plays on without it.
 *
 * The draft's housekeeping lives here, not in the board, which only loads and saves its key.
 */
import { computed, watch } from 'vue'
import { clearDraft, deviceStorage, sweepDrafts } from '@/games/drafts'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { useMyColorHex } from '@/games/useMyColorHex'
import { useRevealedLive } from '@/games/useRevealedLive'
import RevealCover from '@/ui/RevealCover.vue'
import { useSealedAsset } from '@/ui/useSealedAsset'
import { draftKey, draftPrefix } from './draft'
import EchoLocateBoard from './EchoLocateBoard.vue'
import EchoLocateBriefing from './EchoLocateBriefing.vue'
import EchoLocateReveal from './EchoLocateReveal.vue'
import { scoreRows } from './scoreboard'
import SonarField from './SonarField.vue'
import { asEchoLocatePayload, asEchoLocateScene, asEchoLocateSolution } from './types'

const FIRST_CLIP = 'clip-0'
const SECOND_CLIP = 'clip-1'

const props = defineProps<GameProps>()

const emit = defineEmits<GameEmits>()

const payload = computed(() => asEchoLocatePayload(props.payload))
const solution = computed(() => asEchoLocateSolution(props.solution))

/** Only while sealed: with the payload open, the board knows field and count itself. */
const scene = computed(() => (props.sealed === true ? asEchoLocateScene(props.scene) : null))
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
 * the board plays without a draft. A new key makes the board load that key's draft.
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

const myColorHex = useMyColorHex(
  () => props.entries,
  () => props.mineUserId,
)

const animate = useRevealedLive(solved)
</script>

<template>
  <div v-if="scene !== null" data-test="echo-locate-sealed" class="flex flex-col gap-6">
    <!-- The field under the glass is empty: nothing of the round leaves the server before the hold. -->
    <div class="relative">
      <SonarField
        :grid="scene.grid"
        :speed="1"
        :reach="1"
        :waves="[]"
        :rings="[]"
        :pins="[]"
        pin-color-hex="#525252"
        :pending="null"
      />
      <RevealCover
        state="ready"
        :busy="props.disabled"
        :note="scene.clips === 1 ? '1 Spruch' : `${scene.clips} Sprüche`"
        @start="emit('reveal')"
      />
    </div>
    <EchoLocateBriefing
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      :tolerance-radius="null"
      :clips="scene.clips"
    />
  </div>
  <p v-else-if="payload === null" class="text-sm text-on-surface-variant">
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
    :my-color-hex="myColorHex"
    @guess="(guess) => emit('guess', guess)"
    @skip="(stage, input) => emit('skip', stage, input)"
  />
</template>
