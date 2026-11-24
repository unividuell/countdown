<script setup lang="ts">
import { computed } from 'vue'
import IconLoud from '~icons/lucide/volume-2'
import IconSoft from '~icons/lucide/volume-1'
import IconMuted from '~icons/lucide/volume-x'
import { unlockSound } from './audio'
import { useGameSound } from './useGameSound'
import { DEFAULT_VOLUME, useGameVolume } from './useGameVolume'
import { soundOnStage, useSoundAwake } from './useSoundAwake'

const sound = useGameSound()
const volume = useGameVolume()
useSoundAwake()

/** The speaker shows the slider: × at zero, one wave below the default, two from it on. */
const icon = computed(() =>
  volume.value === 0 ? IconMuted : volume.value < DEFAULT_VOLUME ? IconSoft : IconLoud,
)

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
