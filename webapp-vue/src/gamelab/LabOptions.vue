<script setup lang="ts">
/**
 * Phase and ramp: the two lab settings that hold for any game. Shared by the game page and the
 * index, where they are chosen before a game is opened.
 */
import type { LabPhase } from './types'

const props = defineProps<{
  phase: LabPhase
  ramp: boolean
  busy?: boolean
}>()
const emit = defineEmits<{
  phaseChange: [phase: LabPhase]
  rampChange: [on: boolean]
}>()

const PHASES = ['ONE', 'TWO'] as const
</script>

<template>
  <!--
    Two buttons, not a `<select>`: there are exactly two states, and both must be reachable with a
    thumb. `aria-pressed` carries the selected state to a screen reader — colour marks it for
    sighted users, but is never the only signal.
  -->
  <div data-test="lab-phase" class="flex gap-2">
    <button
      v-for="option in PHASES"
      :key="option"
      type="button"
      :data-test="`lab-phase-${option}`"
      :aria-pressed="props.phase === option"
      :disabled="props.busy"
      class="h-11 flex-1 cursor-pointer rounded-md border text-sm disabled:cursor-default disabled:opacity-40"
      :class="
        props.phase === option
          ? 'border-inverse-surface bg-inverse-surface font-semibold text-inverse-on-surface'
          : 'border-outline hover:bg-surface-container'
      "
      @click="emit('phaseChange', option)"
    >
      {{ option === 'ONE' ? 'Phase 1' : 'Phase 2' }}
    </button>
  </div>

  <!-- A checkbox: the ramp is an on/off view option, not an action. -->
  <label class="flex h-11 w-fit cursor-pointer items-center gap-3 text-sm">
    <input
      type="checkbox"
      data-test="lab-ramp"
      :checked="props.ramp"
      @change="emit('rampChange', ($event.target as HTMLInputElement).checked)"
    />
    Rampe
  </label>
</template>
