<script setup lang="ts">
/**
 * The volume for everything the app plays; zero is mute. The caller gives the size.
 * `adjust` fires on every step; `press` and `release` bracket a finger or mouse on it, for a game
 * that lets the new level be heard while the slider is held.
 */
import { unlockSound } from './audio'
import { useGameVolume } from './useGameVolume'
import { soundOnStage } from './useSoundAwake'

const props = defineProps<{ vertical?: boolean }>()

const emit = defineEmits<{ adjust: []; press: []; release: [] }>()

const volume = useGameVolume()

function onInput(e: Event): void {
  volume.value = Number((e.target as HTMLInputElement).value)
  emit('adjust')
}

// On release, not on every step: iOS lets only a tap wake the graph, and `change` is the release.
function onChange(): void {
  if (volume.value > 0 && soundOnStage.value) unlockSound()
}

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
  <!-- Vertical: bottom is silence. `touch-none`, else a vertical drag scrolls the page instead. -->
  <input
    type="range"
    min="0"
    max="1"
    step="0.05"
    aria-label="Lautstärke"
    data-test="volume"
    class="cursor-pointer accent-primary"
    :class="props.vertical ? 'touch-none [direction:rtl] [writing-mode:vertical-lr]' : 'h-11'"
    :aria-orientation="props.vertical ? 'vertical' : undefined"
    :value="volume"
    @input="onInput"
    @change="onChange"
    @pointerdown="onPointerDown"
  />
</template>
