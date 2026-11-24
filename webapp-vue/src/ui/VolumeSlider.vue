<script setup lang="ts">
/**
 * The volume for everything the app plays; zero is mute. The caller gives the width.
 * `adjust` fires on every step, for a game that wants to let the new level be heard.
 */
import { unlockSound } from './audio'
import { useGameVolume } from './useGameVolume'
import { soundOnStage } from './useSoundAwake'

const emit = defineEmits<{ adjust: [] }>()

const volume = useGameVolume()

function onInput(e: Event): void {
  volume.value = Number((e.target as HTMLInputElement).value)
  emit('adjust')
}

// On release, not on every step: iOS lets only a tap wake the graph, and `change` is the release.
function onChange(): void {
  if (volume.value > 0 && soundOnStage.value) unlockSound()
}
</script>

<template>
  <input
    type="range"
    min="0"
    max="1"
    step="0.05"
    aria-label="Lautstärke"
    data-test="volume"
    class="h-11 cursor-pointer accent-primary"
    :value="volume"
    @input="onInput"
    @change="onChange"
  />
</template>
