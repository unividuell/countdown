<script setup lang="ts">
/**
 * The board: the world map, and — once a panorama is open — the ground the player walks. The map
 * fills the whole surface; our own information floats over it as two overlay rows so it never
 * competes for space with the thing that has to be searchable.
 *
 * Knows nothing about the round or the lab — it is handed the term and whether it is locked, and
 * it hands back the tip the open panorama stands on. Everything Google lives in `useStreetView`.
 */
import { onMounted, useTemplateRef } from 'vue'
import type { SpotObjectPayload, SpotObjectTip } from './types'
import { useStreetView } from './useStreetView'

const props = defineProps<{
  payload: SpotObjectPayload
  disabled: boolean
}>()

const emit = defineEmits<{ guess: [tip: SpotObjectTip] }>()

const { error, mount, pano, toWorldMap } = useStreetView()

const stage = useTemplateRef<HTMLElement>('stage')

onMounted(() => {
  if (stage.value) void mount(stage.value)
})

function submitGuess(): void {
  if (!pano.panoId) return
  emit('guess', { panoId: pano.panoId, heading: pano.heading, pitch: pano.pitch, zoom: pano.zoom })
}

// The root's `-m-4` cancels RoundSurface's own body padding on every side: the map is the one
// thing in this game that has to run edge to edge, not just edge to edge below `sm` like
// everything else. Kept out of the template — a leading comment there makes the component
// multi-root (see `frontend-ui.md`).
</script>

<template>
  <div class="relative -m-4 h-[100dvh] sm:h-[min(100dvh-6rem,40rem)]">
    <div ref="stage" data-test="spot-map" class="absolute inset-0 bg-neutral-200" />

    <div
      v-if="error"
      data-test="spot-error"
      class="absolute inset-0 flex items-center justify-center bg-white/95 p-6 text-center"
    >
      <p class="text-sm text-neutral-700">
        Die Karte konnte nicht geladen werden. Versuch es später noch einmal.
      </p>
    </div>

    <!-- Term, top left. `pointer-events-none` on the row so it never steals a pan gesture from
         the map underneath the gaps around the pill. -->
    <div class="pointer-events-none absolute inset-x-0 top-0 flex justify-start p-3">
      <p
        data-test="spot-term"
        class="pointer-events-auto rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-neutral-900 shadow select-none"
      >
        „{{ props.payload.term }}“
      </p>
    </div>

    <!-- Actions, bottom left — never bottom right, where Google's own attribution and Pegman
         controls sit. `env(safe-area-inset-bottom)` clears a phone's home indicator. -->
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 p-3"
      style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
    >
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
</template>
