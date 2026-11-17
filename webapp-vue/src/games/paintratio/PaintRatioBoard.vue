<script setup lang="ts">
/**
 * Playing: the canvas on top, the tools below it, then the hold that signs.
 *
 *   ┌──────────────────────┐
 *   │        canvas        │  template until the first stroke
 *   └──────────────────────┘
 *   [colour]   ● ● ●     ↶ ↷   picker · brushes · undo · redo
 *     Male ein Bild …
 *        ( Signieren )         hold, in the current colour
 *
 * While the hold runs the canvas turns grey and shows the ring large — a palm on the button covers
 * its own ring. A finger on the canvas cancels the hold, and the hold cannot start while one lies
 * there: both go through `HoldButton`'s `disabled`. Released, the canvas is free at once, though the
 * button's ring is still running back.
 *
 * The painting is saved as a draft after every change, undo and redo included.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import IconRedo from '~icons/lucide/redo'
import IconUndo from '~icons/lucide/undo'
import type { AwardRule } from '@/api/types'
import HoldButton from '@/ui/HoldButton.vue'
import HoldLock from '@/ui/HoldLock.vue'
import { readableTextColor } from '@/ui/readableTextColor'
import { useHoldLock } from '@/ui/useHoldLock'
import { deviceStorage } from '../drafts'
import { loadDraft, saveDraft } from './draft'
import PaintCanvas from './PaintCanvas.vue'
import { addStroke, canRedo, EMPTY_PAINT, redo, undo } from './paintHistory'
import type { PaintState } from './paintHistory'
import PaintRatioBriefing from './PaintRatioBriefing.vue'
import { normalizeColor } from './types'
import type { PaintRatioGuess, PaintRatioPayload, Stroke } from './types'

const props = defineProps<{
  payload: PaintRatioPayload
  templateSrc: string | null
  pictureFailed: boolean
  /** The viewer's avatar colour, the picker's preset; may arrive in upper case. */
  myColorHex: string
  /** Where the draft lives; `null` keeps the painting in memory only. */
  draftKey: string | null
  disabled: boolean
  awardRule: AwardRule | null
  awardPoints: number | null
}>()

const emit = defineEmits<{ guess: [value: PaintRatioGuess] }>()

/** Dot sizes after the original's 10/20/40 px, flattened for a phone's tool row. */
const BRUSH_TOOLS = [
  { label: 'Pinsel klein', dot: 'size-2.5' },
  { label: 'Pinsel mittel', dot: 'size-4' },
  { label: 'Pinsel groß', dot: 'size-6' },
]

/** `useMyColorHex`'s own fallback, for an avatar colour the server would not take. */
const FALLBACK_COLOR = '#525252'

/** 32 px wide, below the 44 px floor, so brushes and undo/redo read as groups, as in the original. */
const TOOL =
  'flex h-11 w-8 cursor-pointer items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40'

const storage = deviceStorage()

/** Shallow: a painting holds up to 100 000 points, and none of them needs to be reactive. */
const state = shallowRef<PaintState>(EMPTY_PAINT)
const brush = ref(Math.min(1, props.payload.brushes.length - 1))
const picked = ref<string | null>(null)
const color = computed(() => picked.value ?? normalizeColor(props.myColorHex) ?? FALLBACK_COLOR)

const { progress: holdProgress, locked, onProgress, unlock } = useHoldLock()
const touching = ref(false)

const brushTools = computed(() => BRUSH_TOOLS.slice(0, props.payload.brushes.length))
const canSign = computed(() => !props.disabled && state.value.strokes.length > 0)

// Opening a round restores its painting; a draft that no longer fits has been dropped by `loadDraft`.
watch(
  () => props.draftKey,
  (key) => {
    if (key === null) return

    state.value = loadDraft(storage, key, props.payload.brushes.length) ?? EMPTY_PAINT
  },
  { immediate: true },
)

watch(state, (next) => {
  if (props.draftKey !== null) saveDraft(storage, props.draftKey, next)
})

function pickColor(event: Event): void {
  const value = normalizeColor((event.target as HTMLInputElement).value)
  if (value !== null) picked.value = value
}

function onCommit(stroke: Stroke): void {
  state.value = addStroke(state.value, stroke)
}

function onRedo(): void {
  if (canRedo(state.value)) state.value = redo(state.value)
}

function sign(): void {
  unlock()
  if (canSign.value) emit('guess', { strokes: [...state.value.strokes] })
}
</script>

<template>
  <div data-test="paint-ratio-board" class="flex flex-col gap-6">
    <div class="flex flex-col items-center gap-3">
      <!-- Inside the gutter, not card-wide: on a phone the screen's side edges belong to the OS's
           back gesture, and a stroke starting there would leave the round. -->
      <div class="relative self-stretch">
        <PaintCanvas
          :width="props.payload.width"
          :height="props.payload.height"
          :brushes="props.payload.brushes"
          :state="state"
          :brush="brush"
          :color="color"
          :template-src="props.templateSrc"
          :locked="locked || props.disabled"
          @commit="onCommit"
          @touch="touching = $event"
        />
        <HoldLock
          v-if="locked"
          data-test="paint-ratio-lock"
          :progress="holdProgress"
          label="Signieren …"
        />
      </div>

      <p v-if="props.pictureFailed" class="text-center text-sm text-error">
        Das Bild ließ sich nicht laden.
      </p>

      <!-- Three groups as in the original, always in one row: on a narrow phone the picker gives
           way. It is as wide as undo and redo, so the brushes sit at the centre. -->
      <div
        data-test="paint-ratio-tools"
        class="flex items-center justify-between gap-1 self-stretch"
      >
        <input
          type="color"
          aria-label="Farbe"
          :value="color"
          class="h-11 w-16 min-w-11 cursor-pointer border-0 bg-transparent p-0 [&::-moz-color-swatch]:rounded-lg [&::-moz-color-swatch]:border-outline [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-outline [&::-webkit-color-swatch-wrapper]:px-0 [&::-webkit-color-swatch-wrapper]:py-1.5"
          @input="pickColor"
        />
        <div class="flex items-center">
          <button
            v-for="(tool, index) in brushTools"
            :key="tool.label"
            type="button"
            :aria-label="tool.label"
            :aria-pressed="brush === index"
            :class="TOOL"
            @click="brush = index"
          >
            <span
              aria-hidden="true"
              class="rounded-full"
              :class="[
                tool.dot,
                brush === index
                  ? 'ring-2 ring-on-surface ring-offset-2 ring-offset-surface-container-lowest'
                  : 'ring-1 ring-on-surface/15',
              ]"
              :style="{ backgroundColor: color }"
            />
          </button>
        </div>
        <div class="flex items-center">
          <button
            type="button"
            aria-label="Rückgängig"
            :class="TOOL"
            :disabled="props.disabled || state.strokes.length === 0"
            @click="state = undo(state)"
          >
            <IconUndo class="size-5" aria-hidden="true" />
          </button>
          <!-- Also off while a finger paints: the stroke in progress counts against the same limits. -->
          <button
            type="button"
            aria-label="Wiederholen"
            :class="TOOL"
            :disabled="props.disabled || touching || !canRedo(state)"
            @click="onRedo"
          >
            <IconRedo class="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p class="text-center text-lg">Male ein Bild mit demselben Farbanteil.</p>

      <!-- `HoldButton` fills its parent and has no size of its own. Greyed only for want of a
           stroke: a finger on the canvas disables it too, but quietly, stroke after stroke. -->
      <div class="relative size-24 shrink-0" :class="{ 'opacity-40': !canSign }">
        <HoldButton
          :ready="true"
          :disabled="!canSign || touching"
          label="Gemälde signieren — gedrückt halten"
          :color="color"
          @confirm="sign"
          @progress="onProgress"
        />
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold"
          :style="{ color: readableTextColor(color) }"
        >
          Signieren
        </span>
      </div>
    </div>

    <PaintRatioBriefing
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      :tolerance="props.payload.tolerance"
    />
  </div>
</template>
