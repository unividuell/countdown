<script setup lang="ts">
/**
 * Playing: the field, both names under it, and the hold that submits B's scale.
 *
 * B's placement and the view are saved as a draft after every change. While the hold's ring rises
 * the field is greyed and takes no input, and a finger on it cancels the hold.
 */
import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import HoldButton from '@/ui/HoldButton.vue'
import HoldLock from '@/ui/HoldLock.vue'
import { readableTextColor } from '@/ui/readableTextColor'
import { useGameSound } from '@/ui/useGameSound'
import { useFieldTouch, useHoldLock } from '@/ui/useHoldLock'
import { playPop, unlockSound, type Counting } from './countSound'
import { deviceStorage, loadDraft, saveDraft, sweepDrafts } from './draft'
import {
  FIELD_PX,
  framingOf,
  initialPlacements,
  initialView,
  viewAt,
  type Placement,
  type Submitted,
  type View,
} from './gestures'
import MatchScaleBriefing from './MatchScaleBriefing.vue'
import MatchScaleFootnotes from './MatchScaleFootnotes.vue'
import MatchScaleLegend from './MatchScaleLegend.vue'
import ScaleField from './ScaleField.vue'
import type { MatchScalePayload } from './types'

const props = defineProps<{
  payload: MatchScalePayload
  disabled: boolean
  /** Where the draft lives; `null` keeps B in memory only. */
  draftKey: string | null
  awardRule: AwardRule | null
  awardPoints: number | null
  /** The viewer's avatar colour: the submit button wears it. */
  myColorHex: string
}>()

/** `from` stays in the tab: the reveal's tip travels from there. */
const emit = defineEmits<{ guess: [value: { scale: number }, from: Submitted] }>()

const A_COLOR = 'var(--color-on-surface-variant)'
const B_COLOR = 'var(--color-match-scale-b)'

const storage = deviceStorage()

const placementA = computed(() => initialPlacements(props.payload.a).a)
const placementB = ref<Placement>(initialPlacements(props.payload.a).b)
const view = ref<View>(initialView(FIELD_PX))

/** Set by every change, written once the gesture ends: no synchronous storage write per frame. */
let unsaved = false

// Opening a round starts from its draft, else from the start; the player's stale drafts of other
// rounds go.
watch(
  () => [props.payload, props.draftKey] as const,
  ([payload, key]) => {
    const saved = key === null ? null : loadDraft(storage, key)
    if (key !== null) sweepDrafts(storage, key)

    placementB.value = saved?.b ?? initialPlacements(payload.a).b
    view.value = saved === null ? initialView(FIELD_PX) : viewAt(saved, FIELD_PX)
    unsaved = false
  },
  { immediate: true },
)

function save(): void {
  if (!unsaved || props.draftKey === null) return

  unsaved = false
  saveDraft(storage, props.draftKey, {
    v: 1,
    b: placementB.value,
    ...framingOf(view.value, FIELD_PX),
  })
}

function onPlacement(b: Placement): void {
  placementB.value = b
  unsaved = true
}

function onView(next: View): void {
  view.value = next
  unsaved = true
}

const sound = useGameSound()

// The opening knocks with the pop-in; muting or leaving cuts it.
let popping: Counting | null = null

onMounted(() => {
  if (sound.value) popping = playPop()
})

watch(sound, (on) => {
  if (!on) popping?.stop()
})

onBeforeUnmount(() => popping?.stop())

/** A lift also wakes the graph for the reveal's count, which iOS allows inside a `pointerup` only. */
function onLift(): void {
  save()
  if (sound.value) unlockSound()
}

// A tab sent away mid-gesture may never report the finger's lift.
useEventListener(document, 'visibilitychange', () => {
  if (document.hidden) save()
})

const playable = computed(() => !props.disabled)

// What is being sent cannot change under the hold, and a finger on the field cancels it.
const { progress: holdProgress, locked, onProgress, unlock } = useHoldLock()
const { touching, onDown: onFieldDown, onUp: onFieldUp } = useFieldTouch(locked)

function submit(): void {
  unlock()
  if (!playable.value) return

  emit('guess', { scale: placementB.value.scale }, { view: view.value, b: placementB.value })
}
</script>

<template>
  <div data-test="match-scale-board" class="flex flex-col gap-6">
    <div class="flex flex-col gap-3">
      <section
        data-test="match-scale-field"
        class="relative"
        @pointerdown.capture="onFieldDown"
        @pointerup.capture="onFieldUp"
        @pointercancel.capture="onFieldUp"
        @lostpointercapture.capture="onFieldUp"
        @pointerup="onLift"
        @pointercancel="save"
        @lostpointercapture="save"
        @wheel="save"
      >
        <ScaleField
          :a="props.payload.a"
          :b="props.payload.b"
          :a-color="A_COLOR"
          :b-color="B_COLOR"
          :view="view"
          :placement-a="placementA"
          :placement-b="placementB"
          :outlines="[]"
          :interactive="playable"
          :locked="locked"
          pop-in
          @update:view="onView"
          @update:placement-b="onPlacement"
        />
        <HoldLock v-if="locked" data-test="match-scale-lock" :progress="holdProgress" />
      </section>

      <MatchScaleLegend
        :a="props.payload.a"
        :b="props.payload.b"
        :a-color="A_COLOR"
        :b-color="B_COLOR"
        :measure-a="null"
        :measure-b="null"
        :legend="props.payload.categoryLegend"
      />

      <!-- `HoldButton` fills its parent and has no size of its own. -->
      <div class="flex justify-center">
        <div class="relative size-20" :class="{ 'opacity-40': !playable }">
          <HoldButton
            :ready="true"
            :disabled="!playable || touching"
            label="Größe abgeben — gedrückt halten"
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

    <MatchScaleBriefing :award-rule="props.awardRule" :award-points="props.awardPoints" />

    <MatchScaleFootnotes
      :a="props.payload.a"
      :b="props.payload.b"
      :legend="props.payload.categoryLegend"
    />
  </div>
</template>
