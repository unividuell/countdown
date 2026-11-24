<script setup lang="ts">
/**
 * The volume for everything the app plays; zero is mute. The caller gives the size.
 * Every step ratchets at the new level, so the level is heard while it is set. A game that lets
 * it be heard its own way passes `silent` and listens to `adjust` (every step) and `press` /
 * `release` (a finger or mouse on it).
 *
 * Vertical, the knob is the speaker. The native range stays the control (keys, screen readers,
 * touch) but is invisible; rail and knob are drawn where its own 32 px thumb is:
 *
 *   ┃        rail from the top knob centre, stopping at the knob
 *   🔉       knob, top = (1 − v) · (height − 32 px)
 *   ┃        rail below: the level
 */
import { computed } from 'vue'
import { unlockSound } from './audio'
import { playRatchet } from './ratchetSound'
import { speakerIcon } from './speakerIcon'
import { useGameVolume } from './useGameVolume'
import { soundOnStage } from './useSoundAwake'

defineOptions({ inheritAttrs: false })

const props = defineProps<{ vertical?: boolean; silent?: boolean }>()

const emit = defineEmits<{ adjust: []; press: []; release: [] }>()

const volume = useGameVolume()
const icon = computed(() => speakerIcon(volume.value))

/** The knob's size; the native thumb is set to the same, so drawn and real thumb coincide. */
const KNOB = '2rem'

function onInput(e: Event): void {
  volume.value = Number((e.target as HTMLInputElement).value)
  if (!props.silent) playRatchet()
  emit('adjust')
}

// On release, not on every step: iOS lets only a tap wake the graph, and `change` is the release.
function onChange(): void {
  if (volume.value > 0 && soundOnStage.value) unlockSound()
}

// `@touchmove.stop` on the range: on iOS an open menu's scroll lock (`useScrollLock`) prevents
// every touchmove that reaches body, and that freezes a range's drag (simulator, iOS 18).

// The release is heard on the window: a drag that ends off the slider still ends.
function onPointerDown(): void {
  emit('press')

  const release = (): void => {
    window.removeEventListener('pointerup', release, true)
    window.removeEventListener('pointercancel', release, true)
    emit('release')
  }
  window.addEventListener('pointerup', release, true)
  window.addEventListener('pointercancel', release, true)
}
</script>

<template>
  <span v-if="props.vertical" v-bind="$attrs" class="relative inline-block">
    <!-- The rail runs between the knob's centre at either end — the thumb never gets further —
         and stops at the knob's edge: the knob is a ring, the rail must not show through it. -->
    <span
      aria-hidden="true"
      class="absolute left-1/2 w-1 -translate-x-1/2 rounded-full bg-outline"
      :style="{
        top: `calc(${KNOB} / 2)`,
        height: `max(0px, calc(${1 - volume} * (100% - ${KNOB}) - ${KNOB} / 2))`,
      }"
    />
    <span
      aria-hidden="true"
      class="absolute left-1/2 w-1 -translate-x-1/2 rounded-full bg-on-surface-variant"
      :style="{
        bottom: `calc(${KNOB} / 2)`,
        height: `max(0px, calc(${volume} * (100% - ${KNOB}) - ${KNOB} / 2))`,
      }"
    />
    <!-- Bottom is silence. `touch-none`, else a vertical drag scrolls the page instead. -->
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      aria-label="Lautstärke"
      aria-orientation="vertical"
      data-test="volume"
      class="peer absolute inset-0 m-0 size-full cursor-pointer touch-none appearance-none opacity-0 [direction:rtl] [writing-mode:vertical-lr] [&::-moz-range-thumb]:size-8 [&::-moz-range-thumb]:appearance-none [&::-webkit-slider-thumb]:size-8 [&::-webkit-slider-thumb]:appearance-none"
      :value="volume"
      @input="onInput"
      @change="onChange"
      @pointerdown="onPointerDown"
      @touchmove.stop
    />
    <!-- Just the speaker in a ring, no fill. -->
    <span
      data-test="volume-knob"
      aria-hidden="true"
      class="pointer-events-none absolute left-1/2 grid size-8 -translate-x-1/2 place-items-center rounded-full text-on-surface-variant ring-2 ring-outline"
      :style="{ top: `calc(${1 - volume} * (100% - ${KNOB}))` }"
    >
      <component :is="icon" class="size-5" />
    </span>
  </span>
  <input
    v-else
    v-bind="$attrs"
    type="range"
    min="0"
    max="1"
    step="0.05"
    aria-label="Lautstärke"
    data-test="volume"
    class="h-11 cursor-pointer accent-on-surface-variant"
    :value="volume"
    @input="onInput"
    @change="onChange"
    @pointerdown="onPointerDown"
    @touchmove.stop
  />
</template>
