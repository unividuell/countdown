<script setup lang="ts">
/**
 * One line of poster type, set as large as its own width allows — and no larger than `max`, so a
 * three-letter name does not grow taller than the poster.
 */
import { useElementSize } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { LETTERS, PROBE_PX, useTypeWidth } from '@/ui/ramp/poster'
import { posterName } from '@/ui/ramp/posterText'

const props = defineProps<{ text: string; max: number }>()

const root = useTemplateRef<HTMLElement>('root')
const { width } = useElementSize(root)

const shown = computed(() => posterName(props.text))
const textWidth = useTypeWidth(
  () => shown.value,
  () => LETTERS,
)

const fontSize = computed(() =>
  width.value > 0 && textWidth.value > 0
    ? Math.min(props.max, (PROBE_PX * width.value) / textWidth.value)
    : props.max / 2,
)
</script>

<template>
  <span ref="root" class="block">
    <span class="poster-type block text-center" :style="{ ...LETTERS, fontSize: `${fontSize}px` }">
      {{ shown }}
    </span>
  </span>
</template>
