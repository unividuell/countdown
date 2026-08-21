<script setup lang="ts">
/**
 * One line of text in a box too narrow for it: still at both ends, travelling in between.
 *
 * Whether it travels at all is a measurement, not a guess — `scrollWidth` against `clientWidth`
 * after layout, repeated whenever the box resizes. A line that fits stays put, because a row of
 * four boxes where everything moves is unreadable. The distance is handed to CSS as
 * `--song-ticker-shift`; the timing lives with the animation in `main.css`.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { prefersReducedMotion } from '@/ui/motion'

const props = defineProps<{ text: string }>()

const box = ref<HTMLElement | null>(null)
const shift = ref(0)
let observer: ResizeObserver | null = null

function measure(): void {
  const el = box.value
  if (!el) return
  // Round down: a sub-pixel overflow is nothing to travel for, and `scrollWidth` is an integer.
  const overflow = el.scrollWidth - el.clientWidth
  shift.value = overflow > 1 && !prefersReducedMotion() ? overflow : 0
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'function' && box.value) {
    observer = new ResizeObserver(measure)
    observer.observe(box.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
// After the DOM has the new text: measured before it, `scrollWidth` still describes the old one.
watch(() => props.text, measure, { flush: 'post' })
</script>

<template>
  <span ref="box" class="block overflow-hidden whitespace-nowrap">
    <span
      class="inline-block"
      :class="shift > 0 ? 'animate-song-ticker' : ''"
      :style="shift > 0 ? { '--song-ticker-shift': `-${shift}px` } : undefined"
      data-test="ticker-text"
    >
      {{ props.text }}
    </span>
  </span>
</template>
