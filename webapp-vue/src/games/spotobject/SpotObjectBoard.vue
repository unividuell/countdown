<script setup lang="ts">
/**
 * The board: the world map, and — once a panorama is open — the ground the player walks. The map
 * fills the whole surface; our own information floats over it as one overlay row so it never
 * competes for space with the thing that has to be searchable.
 *
 * Knows nothing about the round or the lab — it is handed the term and whether it is locked, and
 * it hands back the view the open panorama is showing. Everything Google lives in `useStreetView`.
 */
import { onMounted, useTemplateRef } from 'vue'
import { useViewportFill } from '@/ui/useViewportFill'
import type { SpotObjectPayload, SpotObjectTip } from './types'
import { useStreetView } from './useStreetView'

/** Page left free below the map, so a phone still has somewhere to start a scroll. */
const STRIP = 48
/** Below this the map is useless anyway, and overflowing beats a letterbox. */
const MIN_HEIGHT = 320

const props = defineProps<{
  payload: SpotObjectPayload
  disabled: boolean
}>()

const emit = defineEmits<{ guess: [tip: SpotObjectTip] }>()

const { currentTip, error, mount, pano, toWorldMap } = useStreetView()

const stage = useTemplateRef<HTMLElement>('stage')
const frame = useTemplateRef<HTMLElement>('frame')
const filled = useViewportFill(frame, { strip: STRIP, min: MIN_HEIGHT })

onMounted(() => {
  if (stage.value) void mount(stage.value)
})

// Asked at the click, not read off state: the direction the player turned to is the tip.
function submitGuess(): void {
  const tip: SpotObjectTip | null = currentTip()
  if (tip) emit('guess', tip)
}

// The root's `-m-4` cancels RoundSurface's own body padding on every side: the map is the one
// thing in this game that has to run edge to edge, not just edge to edge below `sm` like
// everything else. Kept out of the template — a leading comment there makes the component
// multi-root (see `frontend-ui.md`).
</script>

<template>
  <div
    ref="frame"
    class="relative -m-4 h-[var(--stage-height)] sm:h-[min(100dvh-6rem,40rem)]"
    :style="{ '--stage-height': filled === null ? '100dvh' : `${filled}px` }"
  >
    <!-- `isolate`: the panorama's own chrome carries z-indexes in the millions, and without a
         stacking context here those compete with our overlay row in the ROOT context and win —
         the map mode's controls are modest enough that the row only vanishes once somebody drops
         the Pegman. Isolating traps them where they belong. -->
    <div ref="stage" data-test="spot-map" class="absolute inset-0 isolate bg-neutral-200" />

    <div
      v-if="error"
      data-test="spot-error"
      class="absolute inset-0 flex items-center justify-center bg-white/95 p-6 text-center"
    >
      <p class="text-sm text-neutral-700">
        Die Karte konnte nicht geladen werden. Versuch es später noch einmal.
      </p>
    </div>

    <!-- Everything of ours in the top row: the whole bottom band belongs to Google. Its logo is
         fixed bottom-left in both the map and the panorama and cannot be moved or hidden, the
         „Map data ©… / Terms“ text sits bottom-right, and the zoom and Pegman controls sit above
         them — covering any of it breaks the terms of service. `pointer-events-none` on the row so
         it never steals a pan gesture from the map through the gaps between the pills. -->
    <div
      data-test="spot-actions"
      class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3"
    >
      <p
        data-test="spot-term"
        class="pointer-events-auto min-w-0 truncate rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-neutral-900 shadow select-none"
      >
        „{{ props.payload.term }}“
      </p>

      <div class="flex shrink-0 items-center gap-2">
        <button
          v-if="pano.visible"
          type="button"
          data-test="spot-world-map"
          class="pointer-events-auto h-11 cursor-pointer rounded-full bg-white px-4 text-sm font-medium text-neutral-900 shadow disabled:cursor-default disabled:opacity-40"
          :disabled="props.disabled"
          @click="toWorldMap"
        >
          Zur Weltkarte
        </button>

        <button
          type="button"
          data-test="spot-guess-button"
          class="pointer-events-auto h-11 cursor-pointer rounded-full bg-neutral-900 px-4 text-sm font-medium text-white shadow disabled:cursor-default disabled:opacity-40"
          :disabled="props.disabled || !pano.visible"
          @click="submitGuess"
        >
          Gefunden
        </button>
      </div>
    </div>
  </div>
</template>
