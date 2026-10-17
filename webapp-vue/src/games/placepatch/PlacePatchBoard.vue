<script setup lang="ts">
/**
 * Playing: the grey board with the stamp on it, below it the patch lying on the hold that submits.
 *
 * The answer is nowhere in here — the server sent pictures and three numbers. All this component
 * holds is where the player put the stamp.
 *
 * Card-wide like Entstauber's board: the field runs edge to edge, for the largest cells.
 */
import { computed, ref, useTemplateRef } from 'vue'
import type { AwardRule } from '@/api/types'
import HoldButton from '@/ui/HoldButton.vue'
import RevealCover from '@/ui/RevealCover.vue'
import type { SceneState } from '@/ui/sceneState'
import PlacePatchBriefing from './PlacePatchBriefing.vue'
import { drag, press, release } from './stamp'
import type { Board, Gesture, Point } from './stamp'
import type { Cell, PlacePatchPayload, PlacePatchScene } from './types'

const props = withDefaults(
  defineProps<{
    payload: PlacePatchPayload | null
    /** The board's shape under the cover, while `payload` is still withheld. */
    scene?: PlacePatchScene | null
    sealed?: boolean
    /** Whether both sealed pictures are here — the cover offers START only when they are. */
    sceneState: SceneState
    /** `null` until the reveal brings the keys: the pictures wait sealed under the cover. */
    boardSrc: string | null
    patchSrc: string | null
    /** The viewer's own avatar colour — the stamp is drawn in it, here and in the reveal. */
    myColorHex: string
    disabled: boolean
    /** A guess already submitted — what a reload shows, never something a tap moves. */
    submitted?: Cell | null
    awardRule: AwardRule | null
    awardPoints: number | null
  }>(),
  { scene: null, sealed: false, submitted: null },
)

const emit = defineEmits<{ guess: [value: Cell]; reveal: [] }>()

const layout = computed(() => props.payload ?? props.scene)
const field = useTemplateRef<HTMLDivElement>('field')

const stamp = ref<Cell | null>(null)
const shown = computed(() => props.submitted ?? stamp.value)
const imageFailed = ref(false)
let gesture: Gesture | null = null

const playable = computed(
  () => props.payload !== null && !props.disabled && !props.sealed && props.submitted === null,
)

/** `null` before the field has a width: a `cellPx` of 0 would turn every cell into `NaN`. */
function boardNow(): Board | null {
  const rect = field.value?.getBoundingClientRect()
  if (!props.payload || !rect || rect.width === 0) return null
  return { ...props.payload, cellPx: rect.width / props.payload.cols }
}

function pointOf(event: PointerEvent): Point {
  const rect = field.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function onDown(event: PointerEvent): void {
  const board = boardNow()
  if (!playable.value || board === null) return
  try {
    // Lets the finger leave the field mid-drag. Throws for a pointer the browser does not track —
    // uncaught, it would abort this handler and the gesture would never start.
    field.value?.setPointerCapture(event.pointerId)
  } catch {
    // Capture is an optimisation, not a precondition.
  }
  gesture = press(board, stamp.value, pointOf(event), performance.now())
}

function onMove(event: PointerEvent): void {
  const board = boardNow()
  if (gesture === null || board === null) return
  const next = drag(board, gesture, pointOf(event))
  gesture = next.gesture
  if (next.stamp !== null) stamp.value = next.stamp
}

function onUp(event: PointerEvent): void {
  const board = boardNow()
  if (gesture === null || board === null) return
  stamp.value = release(board, gesture, pointOf(event), stamp.value, performance.now())
  gesture = null
}

/** The browser took the gesture over — scrolling, say. The stamp stays where it was. */
function onCancel(): void {
  gesture = null
}

function submit(): void {
  if (stamp.value !== null) emit('guess', { ...stamp.value })
}

const stampStyle = computed(() => {
  const cell = shown.value
  const board = props.payload
  if (cell === null || board === null) return null
  return {
    left: `${(100 * cell.x) / board.cols}%`,
    top: `${(100 * cell.y) / board.rows}%`,
    width: `${(100 * board.size) / board.cols}%`,
    height: `${(100 * board.size) / board.rows}%`,
    boxShadow: `inset 0 0 0 3px ${props.myColorHex}`,
    backgroundColor: `${props.myColorHex}4d`,
  }
})

/** The patch as wide as it is on the board: size of cols, of the same column width. */
const patchWidth = computed(() =>
  layout.value ? `${(100 * layout.value.size) / layout.value.cols}%` : '0%',
)
</script>

<template>
  <div data-test="place-patch-board" class="flex flex-col gap-6">
    <!-- Card-wide, like Entstauber's: the outer box cancels RoundSurface's padding, so field and
         cover run edge to edge; the bottom padding, cancelled by `-mb-4`, keeps the rules' gap. -->
    <div v-if="layout" class="relative -mx-4 -mt-4 -mb-4 pb-4">
      <div class="flex flex-col items-center gap-3" :inert="props.sealed || undefined">
        <div
          ref="field"
          data-test="place-patch-field"
          class="relative w-full touch-none overflow-hidden bg-neutral-200 select-none"
          :style="{ aspectRatio: `${layout.cols} / ${layout.rows}` }"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onCancel"
        >
          <img
            v-if="props.boardSrc"
            :src="props.boardSrc"
            alt="Das Spielfeld in Graustufen"
            class="pointer-events-none absolute inset-0 size-full [-webkit-touch-callout:none]"
            draggable="false"
            @error="imageFailed = true"
          />
          <div
            v-if="stampStyle"
            data-test="place-patch-stamp"
            class="pointer-events-none absolute"
            :style="stampStyle"
          />
        </div>
        <p
          v-if="imageFailed"
          data-test="place-patch-image-error"
          class="text-center text-sm text-red-700"
        >
          Das Bild ließ sich nicht laden.
        </p>
        <p class="text-center text-lg">Wo gehört dieser Ausschnitt hin?</p>
        <!-- The patch lies on a square hold button of its own size. The slot stands under the cover
             too, empty, so the reveal does not push the rules down. `HoldButton` fills its parent
             and has no size of its own. -->
        <div
          data-test="place-patch-hold-slot"
          class="relative aspect-square shrink-0"
          :style="{ width: patchWidth }"
        >
          <HoldButton
            v-if="!props.sealed"
            :ready="true"
            :disabled="!playable || stamp === null"
            label="Tipp bestätigen — gedrückt halten"
            shape="square"
            @confirm="submit"
          />
          <img
            v-if="props.patchSrc"
            data-test="place-patch-patch"
            :src="props.patchSrc"
            alt="Der gesuchte Ausschnitt"
            class="pointer-events-none absolute inset-0 size-full"
            draggable="false"
            @error="imageFailed = true"
          />
        </div>
      </div>
      <RevealCover
        v-if="props.sealed"
        :state="props.sceneState"
        :busy="props.disabled"
        @start="emit('reveal')"
      />
    </div>

    <PlacePatchBriefing :award-rule="props.awardRule" :award-points="props.awardPoints" />
  </div>
</template>
