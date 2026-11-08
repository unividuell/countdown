<script setup lang="ts">
/**
 * Playing: the grey board with the stamp on it, below it the patch and, to its right, the hold that submits in the player's colour.
 *
 * The answer is nowhere in here — the server sent pictures and three numbers. All this component
 * holds is where the player put the stamp.
 *
 * Card-wide like Entstauber's board: the field runs edge to edge, for the largest cells.
 *
 * The hold in sync with the field, as Anmaßung signs: while it runs the field turns grey and shows
 * the ring large, a finger on the field cancels it, and it cannot start while one lies there.
 */
import { useEventListener } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'
import type { AwardRule } from '@/api/types'
import HoldButton from '@/ui/HoldButton.vue'
import { readableTextColor } from '@/ui/readableTextColor'
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

const emit = defineEmits<{ guess: [value: Cell]; reveal: []; retry: [] }>()

const layout = computed(() => props.payload ?? props.scene)
const field = useTemplateRef<HTMLDivElement>('field')

const stamp = ref<Cell | null>(null)
const shown = computed(() => props.submitted ?? stamp.value)
const imageFailed = ref(false)
/**
 * Uncovered, a picture that never opened leaves no `<img>` to fire `error`; sealed, the cover says it.
 */
const pictureFailed = computed(
  () => imageFailed.value || (!props.sealed && props.sceneState === 'failed'),
)
let gesture: Gesture | null = null

const RING_MASK = 'radial-gradient(closest-side, transparent 86%, #000 87%)'

const holdProgress = ref(0)
/** Only while the ring rises: the rewind after a release is no hold. */
const locked = ref(false)
/** Every pointer on the field, playing or not: any of them keeps the hold off. */
const pointers = new Set<number>()
const touching = ref(false)

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
  if (event.button !== 0) return
  try {
    // Lets the finger leave the field mid-drag. Throws for a pointer the browser does not track —
    // uncaught, it would abort this handler and the gesture would never start.
    field.value?.setPointerCapture(event.pointerId)
  } catch {
    // Capture is an optimisation, not a precondition.
  }

  // Reported before anything else: a finger on a locked field is what cancels the hold.
  pointers.add(event.pointerId)
  touching.value = true

  const board = boardNow()
  if (!playable.value || locked.value || board === null) return
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
  lift(event)
  const board = boardNow()
  if (gesture === null || board === null) return
  stamp.value = release(board, gesture, pointOf(event), stamp.value, performance.now())
  gesture = null
}

/** The browser took the gesture over — scrolling, say. The stamp stays where it was. */
function onCancel(event: PointerEvent): void {
  lift(event)
  gesture = null
}

function lift(event: PointerEvent): void {
  if (pointers.delete(event.pointerId) && pointers.size === 0) touching.value = false
}

/** A finger lifted while the tab was away may never report it, and would keep the hold off. */
useEventListener(document, 'visibilitychange', () => {
  if (!document.hidden) return

  gesture = null
  pointers.clear()
  touching.value = false
})

/** A completed hold reports a full ring after `confirm`; it is no hold in progress any more. */
function onProgress(value: number): void {
  const next = value < 1 ? value : 0

  locked.value = next > holdProgress.value
  holdProgress.value = next
}

/** The lock drops here: a guess that fails hands the board back, and it must not stay grey. */
function submit(): void {
  holdProgress.value = 0
  locked.value = false
  if (stamp.value !== null) emit('guess', { ...stamp.value })
}

const ringStyle = computed(() => {
  const deg = holdProgress.value * 360

  return {
    backgroundImage: `conic-gradient(#fff ${deg}deg, rgb(255 255 255 / 0.3) ${deg}deg 360deg)`,
    mask: RING_MASK,
    WebkitMask: RING_MASK,
  }
})

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
          @lostpointercapture="lift"
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
          <!-- Lets every touch through to the field: a touch there is what cancels the hold. -->
          <div
            v-if="locked"
            data-test="place-patch-lock"
            class="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-500/60"
          >
            <div class="relative flex size-40 items-center justify-center">
              <span aria-hidden="true" class="absolute inset-0 rounded-full" :style="ringStyle" />
              <span class="text-lg font-semibold text-white">Abgeben …</span>
            </div>
          </div>
        </div>
        <p
          v-if="pictureFailed"
          data-test="place-patch-image-error"
          class="text-center text-sm text-red-700"
        >
          Das Bild ließ sich nicht laden.
        </p>
        <p class="text-center text-lg">Wo gehört dieser Ausschnitt hin?</p>
        <!-- One row: the patch centred at board scale, the hold that submits at its right. The
             patch slot stands under the cover too, empty, so the reveal does not push the rules
             down. `HoldButton` fills its parent and has no size of its own. -->
        <div class="relative flex w-full items-center justify-center">
          <div
            data-test="place-patch-slot"
            class="relative aspect-square shrink-0"
            :style="{ width: patchWidth }"
          >
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
          <div
            v-if="!props.sealed"
            data-test="place-patch-submit"
            class="absolute top-1/2 right-4 size-20 -translate-y-1/2"
            :class="{ 'opacity-40': !playable || stamp === null }"
          >
            <HoldButton
              :ready="true"
              :disabled="!playable || stamp === null || touching"
              label="Tipp bestätigen — gedrückt halten"
              :color="props.myColorHex"
              @confirm="submit"
              @progress="onProgress"
            />
            <span
              aria-hidden="true"
              class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold"
              :style="{ color: readableTextColor(props.myColorHex) }"
            >
              Abgeben
            </span>
          </div>
        </div>
      </div>
      <RevealCover
        v-if="props.sealed"
        :state="props.sceneState"
        :busy="props.disabled"
        @start="emit('reveal')"
        @retry="emit('retry')"
      />
    </div>

    <PlacePatchBriefing :award-rule="props.awardRule" :award-points="props.awardPoints" />
  </div>
</template>
