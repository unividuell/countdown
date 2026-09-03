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
import { computed, onUnmounted, ref, watch, useTemplateRef } from 'vue'
import IconMaximize from '~icons/lucide/maximize-2'
import IconMinimize from '~icons/lucide/minimize-2'
import IconMove from '~icons/lucide/move'

const props = defineProps<{
  open: boolean
  /** The last press found nothing to walk into. */
  missed: boolean
  /** The board, as the room the panel may be dragged around in. */
  bounds: HTMLElement | null
}>()

const emit = defineEmits<{
  /** The panel is on screen; here is the element to build the map into. */
  shown: [element: HTMLElement]
  /** Down a size, to the icon. */
  collapse: []
  /** Up a size, to the full-screen world map. */
  expand: []
}>()

/** The gutter the controls above keep, so a dragged panel lines up with them. */
const EDGE = 12

/**
 * The strip along the bottom of the *board* that carries Google's logo and its terms link, in the
 * panorama as much as on the map. Covering either breaks the terms, so the panel stops above it.
 */
const GOOGLE_BAND = 40

const stage = useTemplateRef<HTMLElement>('stage')
const panel = useTemplateRef<HTMLElement>('panel')

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

/**
 * Where the player has parked the panel, as a shift from the corner it opens at. A shift and not a
 * position: the panel keeps its place in the row's layout, so nothing reflows while it is dragged
 * and „Gefunden“ never moves. It survives closing and reopening, because the panel is only ever
 * hidden.
 */
const offset = ref({ x: 0, y: 0 })

const moved = computed(() =>
  offset.value.x === 0 && offset.value.y === 0
    ? undefined
    : `translate(${offset.value.x}px, ${offset.value.y}px)`,
)

/**
 * Where the drag started, and the two boxes it is measured against: `home` is where the panel sits
 * with no shift at all, `area` the board it may not leave. Both are read once, at the press — the
 * panel's own box moves as it is dragged, so reading it again mid-drag would chase itself.
 */
let drag: {
  x: number
  y: number
  from: { x: number; y: number }
  home: { left: number; top: number; width: number; height: number }
  area: DOMRect
} | null = null

/**
 * Window listeners rather than `setPointerCapture`: the drag ends wherever the finger lifts, which
 * is regularly outside a 28px handle — the same reason the Pegman watcher in `useStreetView` hangs
 * its release off the window.
 */
function startDrag(event: PointerEvent): void {
  const element = panel.value
  const area = props.bounds?.getBoundingClientRect()
  if (!element || !area) return

  event.preventDefault()
  const box = element.getBoundingClientRect()
  drag = {
    x: event.clientX,
    y: event.clientY,
    from: { ...offset.value },
    home: {
      left: box.left - offset.value.x,
      top: box.top - offset.value.y,
      width: box.width,
      height: box.height,
    },
    area,
  }

  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function onDrag(event: PointerEvent): void {
  if (!drag) return
  const { home, area, from } = drag

  offset.value = {
    x: between(
      from.x + event.clientX - drag.x,
      area.left + EDGE - home.left,
      area.right - EDGE - home.width - home.left,
    ),
    y: between(
      from.y + event.clientY - drag.y,
      area.top + EDGE - home.top,
      area.bottom - GOOGLE_BAND - home.height - home.top,
    ),
  }
}

function endDrag(): void {
  drag = null
  window.removeEventListener('pointermove', onDrag)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

onUnmounted(endDrag)

/** `min` wins when the panel is wider than the room it has: pinned to an edge beats pushed out. */
function between(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}
</script>

<template>
  <!-- The frame the shift is applied to, and the one thing that is not clipped — the handle hangs
       off its corner. `pointer-events-auto` re-arms what the overlay column above switched off. -->
  <div
    v-show="props.open"
    ref="panel"
    data-test="spot-mini-panel"
    class="pointer-events-auto relative w-[min(13rem,55vw)]"
    :style="{ transform: moved }"
  >
    <!--
      Rounded the same on all four corners, and modestly. Every Google map draws its logo into the
      bottom-left corner and „Kartendaten © … / Nutzungsbedingungen“ into the bottom-right, neither
      movable nor removable, and cropping either breaks the terms — which is also why this is a
      square with soft corners and not the circle it wants to be.

      Width against the *viewport*, capped. Per cent would be the better measure and cannot be
      used: this sits in a flex item that sizes itself to its content, so a percentage width has
      nothing to resolve against — it came out as zero, and the only thing left on screen was the
      handle hanging off the corner. On a phone the board is the viewport anyway; on a desktop the
      board is capped at `max-w-xl` and the cap takes over.
    -->
    <div class="relative aspect-square overflow-hidden rounded-lg bg-neutral-200 shadow-lg">
      <div ref="stage" data-test="spot-mini-stage" class="absolute inset-0" />

      <!-- Top row only, all of it: the bottom belongs to Google. -->
      <p
        v-if="props.missed"
        data-test="spot-mini-missed"
        class="pointer-events-none absolute top-2 left-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-[10px] text-white"
      >
        Keine Aufnahme hier.
      </p>

      <!-- Both sizes out of here have their own control, because a press on the map itself moves
           the player. Two arrows apart and two arrows together: the pair names the step, and the
           same inward pair sits in the actions row when the map is at its largest. -->
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
          aria-label="Übersichtskarte verkleinern"
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow"
          @click="emit('collapse')"
        >
          <IconMinimize aria-hidden="true" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!--
      Half on the panel, half off it: inside the frame it would be one more thing competing with
      the map for presses, and a drag that starts on the map has to stay Google's — that is how you
      pan the mini-map itself. Sitting on the corner it belongs to the panel as a whole.

      `touch-none` so a finger on it drags the panel instead of scrolling the page.
    -->
    <button
      type="button"
      data-test="spot-mini-grab"
      aria-label="Übersichtskarte verschieben"
      class="absolute -top-2 -left-2 flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-full bg-white text-neutral-900 shadow active:cursor-grabbing"
      @pointerdown="startDrag"
    >
      <IconMove aria-hidden="true" class="h-3.5 w-3.5" />
    </button>
  </div>
</template>
