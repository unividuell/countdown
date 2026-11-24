<script setup lang="ts">
import { computed } from 'vue'
import { unlockSound } from './audio'
import { useGameSound } from './useGameSound'
import { speakerIcon } from './speakerIcon'
import { useGameVolume } from './useGameVolume'
import { soundOnStage, useSoundAwake } from './useSoundAwake'

const sound = useGameSound()
const volume = useGameVolume()
useSoundAwake()

/** The speaker shows the slider. */
const icon = computed(() => speakerIcon(volume.value))

function onClick(): void {
  sound.value = !sound.value

  // Off stage nothing would sound, and waking would claim the device's audio session.
  if (sound.value && soundOnStage.value) unlockSound()
}
</script>

<template>
  <button type="button" aria-label="Ton" :aria-pressed="sound" @click="onClick">
    <component :is="icon" data-test="sound-icon" class="size-5" aria-hidden="true" />
  </button>
</template>
