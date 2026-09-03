<script setup lang="ts">
/**
 * The overview map inside Street View: where you are, which way you face, where you have been —
 * and, on a press, where you go next.
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
import IconMap from '~icons/lucide/map'
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
  /** The player asked for the panel. Whether it opens is the board's call. */
  expand: []
  /** The panel is on screen; here is the element to build the map into. */
  shown: [element: HTMLElement]
  collapse: []
}>()

const stage = useTemplateRef<HTMLElement>('stage')

/**
 * Hung on the prop rather than on the button, and the reason is Google: a map built into a
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
  <!-- `pointer-events-none` on the frame, re-armed per control: the gap beside the panel must
       still turn the panorama, not swallow the drag. -->
  <div class="pointer-events-none absolute inset-x-0 top-0 p-3">
    <button
      v-show="!props.open"
      type="button"
      data-test="spot-mini-open"
      aria-label="Übersichtskarte öffnen"
      class="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-neutral-900 shadow"
      @click="emit('expand')"
    >
      <IconMap aria-hidden="true" class="h-5 w-5" />
    </button>

    <!--
      Rounded hard at the top, barely at the bottom. Every Google map draws its logo into the
      bottom-left corner and „Kartendaten © … / Nutzungsbedingungen“ into the bottom-right, neither
      movable nor removable, and covering or cropping either breaks the terms — which is also why
      this is a square with soft corners and not the circle it wants to be: a circle cuts off both.
      A 24px curve at the top costs nothing, because nothing of Google's is up there.

      Width in per cent of the board, capped: on a phone a fixed size is either half the screen or
      a postage stamp, depending on the phone.
    -->
    <div
      v-show="props.open"
      data-test="spot-mini-panel"
      class="pointer-events-auto relative aspect-square w-[min(55%,13rem)] overflow-hidden rounded-t-3xl rounded-b-lg bg-neutral-200 shadow-lg"
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

      <!-- Top row only, both of them: the bottom belongs to Google. -->
      <p
        v-if="props.missed"
        data-test="spot-mini-missed"
        class="pointer-events-none absolute top-2 left-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-[10px] text-white"
      >
        Keine Aufnahme hier.
      </p>

      <!-- Its own control, because a press on the map itself moves the player. -->
      <button
        type="button"
        data-test="spot-mini-close"
        aria-label="Übersichtskarte schließen"
        class="absolute top-2 right-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow"
        @click="emit('collapse')"
      >
        <IconX aria-hidden="true" class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
