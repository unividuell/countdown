<script setup lang="ts">
/**
 * The middle size of the map: where you are, which way you face, where you have been — and, on a
 * press, where you go next. The board owns the two ends of the range (the icon that opens this,
 * and the full-screen world map), so this file is only the panel.
 *
 * Its own Google map, because the board's map cannot be in two places at once: the default
 * panorama renders *inside* the map's element, so while somebody is walking there is no map left
 * to look at. Handing the panorama a container of its own would mean constructing one, which is
 * the one thing this game may never do. `useWalkMap` therefore builds a second map — lazily, on
 * the first open, so a player who never asks for it never pays for it.
 *
 * Chrome only: everything Google lives in `useWalkMap`, which is handed the element below.
 */
import { watch, useTemplateRef } from 'vue'
import IconMaximize from '~icons/lucide/maximize-2'
import IconX from '~icons/lucide/x'

const props = defineProps<{
  open: boolean
  /** Where the panorama faces, so the cone points the same way. */
  heading: number
  /** The last press found nothing to walk into. */
  missed: boolean
  /** The player's own colour — the trail's, and the cone's. */
  color: string
}>()

const emit = defineEmits<{
  /** The panel is on screen; here is the element to build the map into. */
  shown: [element: HTMLElement]
  /** Down a size, to the icon. */
  collapse: []
  /** Up a size, to the full-screen world map. */
  expand: []
}>()

const stage = useTemplateRef<HTMLElement>('stage')

/**
 * Hung on the prop rather than on a button, and the reason is Google: a map built into a
 * `display:none` element measures itself as nothing. So the element is handed over only once the
 * panel is actually being shown — which is also every *later* open, when the map has to be told
 * to re-centre after a spell of being hidden.
 */
watch(
  () => props.open,
  (open) => {
    if (open && stage.value) emit('shown', stage.value)
  },
)
</script>

<template>
  <!--
    Rounded the same on all four corners, and modestly. Every Google map draws its logo into the
    bottom-left corner and „Kartendaten © … / Nutzungsbedingungen“ into the bottom-right, neither
    movable nor removable, and cropping either breaks the terms — which is also why this is a
    square with soft corners and not the circle it wants to be.

    Width in per cent of the board, capped: on a phone a fixed size is either half the screen or a
    postage stamp, depending on the phone. `pointer-events-auto` re-arms what the overlay column
    above switched off — a press beside the panel must still turn the panorama.
  -->
  <div
    v-show="props.open"
    data-test="spot-mini-panel"
    class="pointer-events-auto relative mx-3 mb-3 aspect-square w-[min(55%,13rem)] overflow-hidden rounded-lg bg-neutral-200 shadow-lg"
  >
    <div ref="stage" data-test="spot-mini-stage" class="absolute inset-0" />

    <!-- The player, at the map's own centre: the map is kept centred on them, so this never
         moves — it only turns. -->
    <svg
      data-test="spot-mini-cone"
      aria-hidden="true"
      viewBox="0 0 24 24"
      class="pointer-events-none absolute top-1/2 left-1/2 h-7 w-7"
      :style="{ transform: `translate(-50%, -50%) rotate(${props.heading}deg)` }"
    >
      <path
        d="M12 2 L19 20 L12 16 L5 20 Z"
        :fill="props.color"
        stroke="#ffffff"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>

    <!-- Top row only, all of it: the bottom belongs to Google. -->
    <p
      v-if="props.missed"
      data-test="spot-mini-missed"
      class="pointer-events-none absolute top-2 left-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-[10px] text-white"
    >
      Keine Aufnahme hier.
    </p>

    <!-- Both sizes out of here have their own control, because a press on the map itself moves
         the player. -->
    <div class="absolute top-2 right-2 flex gap-1">
      <button
        type="button"
        data-test="spot-mini-full"
        aria-label="Karte bildschirmfüllend"
        class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow"
        @click="emit('expand')"
      >
        <IconMaximize aria-hidden="true" class="h-4 w-4" />
      </button>

      <button
        type="button"
        data-test="spot-mini-close"
        aria-label="Übersichtskarte schließen"
        class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow"
        @click="emit('collapse')"
      >
        <IconX aria-hidden="true" class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
