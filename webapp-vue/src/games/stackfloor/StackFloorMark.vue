<script setup lang="ts">
/**
 * A run's mark behind its name: a turning arrow after a reload, a warning sign for a submit that came
 * before the run could have ended. The hint and its popover are the shared `RunMark`. Icons, not U+26A0 or
 * U+21BB: phones draw the warning sign as a yellow emoji.
 */
import IconRestarted from '~icons/lucide/rotate-cw'
import IconWarning from '~icons/lucide/triangle-alert'
import RunMark from '@/games/RunMark.vue'
import type { StackFloorMark } from './types'

const props = defineProps<{ mark: StackFloorMark }>()

const HINTS: Record<StackFloorMark, string> = {
  RESTARTED: 'Markiert: neu geladen',
  SUBMITTED_BEFORE_RUN_END: 'Markiert: früher abgegeben, als der Lauf dauern kann',
}
</script>

<template>
  <RunMark :hint="HINTS[props.mark]">
    <IconRestarted v-if="props.mark === 'RESTARTED'" class="size-[1em]" aria-hidden="true" />
    <IconWarning v-else class="size-[1em]" aria-hidden="true" />
  </RunMark>
</template>
