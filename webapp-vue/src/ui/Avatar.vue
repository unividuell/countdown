<script setup lang="ts">
/**
 * How a member is drawn, everywhere: their four-character label on their colour.
 *
 * The circle is the root element, so a caller can attach its own attributes to the circle
 * itself — MemberRow measures it during the fly-in and needs the marker on the real geometry.
 */
import { computed } from 'vue'
import { readableTextColor } from './readableTextColor'

const props = withDefaults(
  defineProps<{
    shortName: string
    bgColorHex: string
    size?: 'sm' | 'lg'
    variant?: 'color' | 'muted' | 'grayscale'
  }>(),
  { size: 'lg', variant: 'color' },
)

const textColor = computed(() => readableTextColor(props.bgColorHex))
const sizing = computed(() => (props.size === 'sm' ? 'size-8 text-xs' : 'size-12 text-sm'))
const filter = computed(
  () => ({ color: '', muted: 'saturate-50', grayscale: 'grayscale' })[props.variant],
)
</script>

<template>
  <div
    class="flex place-content-around rounded-full ring-2 ring-white"
    :class="[sizing, filter]"
    :style="{ background: bgColorHex, color: textColor }"
  >
    <div class="place-self-center rotate-[-40deg] font-medium">{{ shortName }}</div>
  </div>
</template>
