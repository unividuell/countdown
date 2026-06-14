<script setup lang="ts">
import { toRef } from 'vue'
import { useCountdown } from '@/communities/useCountdown'

const props = defineProps<{ slug: string | null | undefined }>()
const { view, cycleBaseUnit } = useCountdown(toRef(props, 'slug'))
</script>

<template>
  <div
    v-if="view.state !== 'idle'"
    data-test="countdown"
    role="button"
    class="flex items-center gap-1 font-mono text-sm tabular-nums select-none sm:gap-2"
    :title="view.state === 'after' ? 'Event läuft' : 'Countdown bis zum Start'"
    @click="cycleBaseUnit"
  >
    <span v-if="view.state === 'after'" class="mr-1 text-xs uppercase tracking-wide text-stone-300"
      >Event läuft</span
    >
    <span>{{ view.prefix }}</span>
    <span v-for="(chip, i) in view.chips" :key="i">
      <span>{{ chip.value }}</span
      ><span class="text-xs text-stone-300">{{ chip.unit }}</span>
    </span>
  </div>
</template>
