<script lang="ts">
import { FLARE_MS } from './streak'
import { VERDICT_MS } from '@/games/revealChoreography'

const FADE_IN_MS = 100
/** Faded in, then one beat on the old standing, so the change happens in view. */
export const SWAP_MS = 250
const HOLD_MS = 250
const FADE_OUT_MS = 250
/** Room for a streak flare, which the row starts `VERDICT_MS` after the points land. */
export const POP_MS = VERDICT_MS + FLARE_MS + HOLD_MS + FADE_OUT_MS
</script>

<script setup lang="ts">
/**
 * My roster column, shown where I am looking when my points change and my own column is out of
 * view: avatar, streak badge, points, at one and a half. It mounts on the standing before the
 * change, then shows the new one; a grown streak flares when the row lets it rise, with the
 * triangle.
 *
 *   0 ── 100 ── 250 ──────── 550 ─────── 1150 ── 1400 ── 1650 ms
 *   fade in     new points   flare?       hold    fade out → done
 *
 * The 48px circle is centred on `x`, `y`.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { POP_SCALE } from './popPlacement'
import MemberColumn from './MemberColumn.vue'
import type { RosterMemberResponse } from '@/api/types'

const props = defineProps<{
  before: RosterMemberResponse
  after: RosterMemberResponse
  /** The row's shown streak; a rise is the flare. */
  streak: number
  x: number
  y: number
}>()
const emit = defineEmits<{ done: [] }>()

const root = ref<HTMLElement | null>(null)
const swapped = ref(false)
const member = computed(() => (swapped.value ? props.after : props.before))
const timers: ReturnType<typeof setTimeout>[] = []

onMounted(() => {
  root.value?.animate(
    [
      { offset: 0, opacity: 0 },
      { offset: FADE_IN_MS / POP_MS, opacity: 1 },
      { offset: 1 - FADE_OUT_MS / POP_MS, opacity: 1 },
      { offset: 1, opacity: 0 },
    ],
    { duration: POP_MS, fill: 'forwards' },
  )
  timers.push(
    setTimeout(() => (swapped.value = true), SWAP_MS),
    setTimeout(() => emit('done'), POP_MS),
  )
})

onBeforeUnmount(() => timers.forEach(clearTimeout))
</script>

<template>
  <div
    ref="root"
    data-test="member-pop"
    aria-hidden="true"
    class="pointer-events-none fixed z-30 origin-top-left"
    :style="{ left: `${x}px`, top: `${y}px`, transform: `scale(${POP_SCALE})` }"
  >
    <MemberColumn
      data-test="member-pop-box"
      class="absolute"
      style="left: -24px; top: -24px"
      :member="member"
      :streak="streak"
    />
  </div>
</template>
