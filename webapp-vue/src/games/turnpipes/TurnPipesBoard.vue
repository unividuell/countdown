<script setup lang="ts">
/**
 * Playing: the pipe board card-wide, and under it the hold that submits, the sound switch beside it.
 *
 * A tap turns one tile a quarter clockwise. The turns are saved as a draft after every tap; the
 * board shows no count, no undo and no sign of whether the line holds.
 */
import { computed, onMounted, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import HoldButton from '@/ui/HoldButton.vue'
import HoldLock from '@/ui/HoldLock.vue'
import { readableTextColor } from '@/ui/readableTextColor'
import RevealCover from '@/ui/RevealCover.vue'
import SoundToggle from '@/ui/SoundToggle.vue'
import { useGameSound } from '@/ui/useGameSound'
import { useFieldTouch, useHoldLock } from '@/ui/useHoldLock'
import { deviceStorage, loadDraft, saveDraft, sweepDrafts } from './draft'
import PipeGrid from './PipeGrid.vue'
import { playSound, preloadSounds } from './sounds'
import { rotationsOf } from './turns'
import TurnPipesBriefing from './TurnPipesBriefing.vue'
import { MIN_SIZE } from './types'
import type { TurnPipesGuess, TurnPipesPayload, TurnPipesScene } from './types'

const props = defineProps<{
  /** `null` while sealed: the server withholds the round until the reveal. */
  payload: TurnPipesPayload | null
  /** The empty board under the cover. */
  scene: TurnPipesScene | null
  sealed: boolean
  disabled: boolean
  /** Where the draft lives; `null` keeps the turns in memory only. */
  draftKey: string | null
  awardRule: AwardRule | null
  awardPoints: number | null
  /** The viewer's avatar colour: the submit button wears it. */
  myColorHex: string
}>()

const emit = defineEmits<{ guess: [value: TurnPipesGuess]; reveal: [] }>()

/** The round on show; `null` under the cover. */
const round = computed(() => (props.sealed ? null : props.payload))
const playable = computed(() => round.value !== null && !props.disabled)
const size = computed(() => props.payload?.size ?? props.scene?.size ?? MIN_SIZE)

const sound = useGameSound()
const storage = deviceStorage()

const turns = ref<number[]>([])
const NO_WATER: ReadonlySet<number> = new Set()

// Opening a round starts from its draft, else from the scrambled start; the player's stale drafts
// of other rounds go.
watch(
  () => [props.payload, props.draftKey] as const,
  ([payload, key]) => {
    if (payload === null) {
      turns.value = Array.from({ length: size.value ** 2 }, () => 0)
      return
    }

    const saved = key === null ? null : loadDraft(storage, key, payload.size)
    if (key !== null) sweepDrafts(storage, key)
    turns.value = saved ?? [...payload.start]
  },
  { immediate: true },
)

onMounted(preloadSounds)

// While the submit ring rises the board is greyed, a finger on it cancels the hold, and the tap
// that finger makes turns nothing — what is being sent cannot change under the hold.
const { progress: holdProgress, locked, onProgress, unlock } = useHoldLock()
const { touching, onDown: onFieldDown, onUp: onFieldUp, takeTap } = useFieldTouch(locked)

function onTap(cell: number): void {
  if (takeTap()) return
  if (!playable.value) return

  turns.value = turns.value.map((turn, i) => (i === cell ? turn + 1 : turn))
  if (props.draftKey !== null) saveDraft(storage, props.draftKey, rotationsOf(turns.value))
  if (sound.value) playSound('turn')
}

function submit(): void {
  unlock()
  if (playable.value) emit('guess', { rotations: rotationsOf(turns.value) })
}
</script>

<template>
  <div data-test="turn-pipes-board" class="flex flex-col gap-6">
    <!-- Card-wide: the outer box cancels RoundSurface's padding, so the board and the cover run
         edge to edge; the bottom padding, cancelled by `-mb-4`, keeps the rules' gap. -->
    <div class="relative -mx-4 -mt-4 -mb-4 pb-4">
      <div class="flex flex-col gap-3" :inert="!round || undefined">
        <section
          data-test="turn-pipes-field"
          class="relative"
          @pointerdown.capture="onFieldDown"
          @pointerup.capture="onFieldUp"
          @pointercancel.capture="onFieldUp"
          @lostpointercapture.capture="onFieldUp"
        >
          <PipeGrid
            :size="size"
            :kinds="round?.kinds ?? null"
            :turns="turns"
            :wet="NO_WATER"
            :leak-cell="null"
            :interactive="playable"
            @tap="onTap"
          />
          <HoldLock v-if="locked" data-test="turn-pipes-lock" :progress="holdProgress" />
        </section>

        <!-- The slot stands under the cover too, empty, so the reveal does not push the rules
             down. `HoldButton` fills its parent and has no size of its own. -->
        <div class="grid grid-cols-[1fr_auto_1fr] items-center">
          <div class="relative col-start-2 size-20" :class="{ 'opacity-40': round && !playable }">
            <template v-if="round">
              <HoldButton
                :ready="true"
                :disabled="!playable || touching"
                label="Leitung abgeben — gedrückt halten"
                :color="props.myColorHex"
                @confirm="submit"
                @progress="onProgress"
              />
              <span
                data-test="turn-pipes-submit-label"
                aria-hidden="true"
                class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold"
                :style="{ color: readableTextColor(props.myColorHex) }"
              >
                Abgeben
              </span>
            </template>
          </div>
          <SoundToggle
            v-if="round"
            class="col-start-3 ms-4 flex size-11 cursor-pointer items-center justify-center justify-self-start rounded-full bg-surface-container text-on-surface"
          />
        </div>
      </div>
      <RevealCover v-if="!round" state="ready" :busy="props.disabled" @start="emit('reveal')" />
    </div>

    <TurnPipesBriefing :award-rule="props.awardRule" :award-points="props.awardPoints" />
  </div>
</template>
