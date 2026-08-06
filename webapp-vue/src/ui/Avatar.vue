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
  }>(),
  { size: 'lg' },
)

const textColor = computed(() => readableTextColor(props.bgColorHex))
const sizing = computed(() => (props.size === 'sm' ? 'size-8 text-[10px]' : 'size-12 text-sm'))
</script>

<template>
  <div
    class="flex place-content-around rounded-full ring-2 ring-white"
    :class="sizing"
    :style="{ background: bgColorHex, color: textColor }"
  >
    <div class="place-self-center rotate-[-40deg] font-medium">{{ shortName }}</div>
  </div>
</template>
