<script setup lang="ts">
/**
 * A run's mark behind its name, and what it means: on hover as the browser's tooltip, on a phone by
 * holding it — a phone has no hover. Held, the hint opens as a popover over the mark: in the top
 * layer, so no table cell clips it, and closed by the next tap anywhere or a scroll — it is pinned to
 * the viewport, not to the mark. The click that ends a hold stops here: holding explains, it never
 * selects the run.
 */
import { onBeforeUnmount, ref } from 'vue'
import { useEventListener } from '@vueuse/core'

const HOLD_MS = 500
/** A finger that wanders further is scrolling, not holding. */
const SLOP_PX = 8
/** The popover's distance to the mark, and to the viewport's edge. */
const GAP_PX = 6
const EDGE_PX = 8
/** A finger covers the mark and what is right above it: a held hint rises by one more line. */
const FINGER_PX = 24

const props = defineProps<{ hint: string }>()

const mark = ref<HTMLElement | null>(null)
const popover = ref<HTMLElement | null>(null)

let timer: ReturnType<typeof setTimeout> | null = null
let origin: { x: number; y: number } | null = null
let held = false
let shown = false
let touch = false

useEventListener(
  window,
  'scroll',
  () => {
    if (shown) popover.value?.hidePopover()
  },
  { capture: true, passive: true },
)

function press(event: PointerEvent): void {
  if (!event.isPrimary) return
  held = false
  touch = event.pointerType === 'touch'
  origin = { x: event.clientX, y: event.clientY }
  timer = setTimeout(open, HOLD_MS)
}

function move(event: PointerEvent): void {
  if (origin === null) return
  if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > SLOP_PX) release()
}

function release(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
  origin = null
}

function open(): void {
  release()
  held = true
  const anchor = mark.value
  const hint = popover.value
  if (anchor === null || hint === null) return
  hint.showPopover()

  // Centred over the mark, inside the viewport. Never under it: that is where the finger is.
  const box = anchor.getBoundingClientRect()
  const maxLeft = window.innerWidth - hint.offsetWidth - EDGE_PX
  const left = Math.min(Math.max(box.left + box.width / 2 - hint.offsetWidth / 2, EDGE_PX), maxLeft)
  const above = box.top - hint.offsetHeight - GAP_PX - (touch ? FINGER_PX : 0)
  hint.style.left = `${left}px`
  hint.style.top = `${Math.max(above, EDGE_PX)}px`
}

/** Light dismiss closes it without asking: the scroll listener learns it from here. */
function onToggle(event: ToggleEvent): void {
  shown = event.newState === 'open'
}

function swallow(event: MouseEvent): void {
  if (!held) return
  held = false
  event.preventDefault()
  event.stopPropagation()
}

onBeforeUnmount(release)
</script>

<template>
  <span
    ref="mark"
    class="shrink-0 self-center select-none [-webkit-touch-callout:none]"
    :title="props.hint"
    @pointerdown="press"
    @pointermove="move"
    @pointerup="release"
    @pointercancel="release"
    @pointerleave="release"
    @click="swallow"
    @contextmenu.prevent
    ><slot /><span class="sr-only">{{ props.hint }}</span
    ><span
      ref="popover"
      popover="auto"
      role="tooltip"
      data-test="mark-hint"
      class="fixed inset-auto m-0 max-w-64 rounded-md border-0 bg-neutral-900 px-2 py-1 text-xs font-normal text-white shadow-md"
      @pointerdown.stop
      @click.stop
      @toggle="onToggle"
      >{{ props.hint }}</span
    ></span
  >
</template>
