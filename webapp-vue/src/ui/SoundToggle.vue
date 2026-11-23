<script setup lang="ts">
import IconVolume from '~icons/lucide/volume-2'
import IconMuted from '~icons/lucide/volume-x'
import { unlockSound } from './audio'
import { useGameSound } from './useGameSound'
import { soundOnStage, useSoundAwake } from './useSoundAwake'

const sound = useGameSound()
useSoundAwake()

function onClick(): void {
  sound.value = !sound.value

  // Off stage nothing would sound, and waking would claim the device's audio session.
  if (sound.value && soundOnStage.value) unlockSound()
}
</script>

<template>
  <button type="button" aria-label="Ton" :aria-pressed="sound" @click="onClick">
    <IconVolume v-if="sound" class="size-5" aria-hidden="true" />
    <IconMuted v-else class="size-5" aria-hidden="true" />
  </button>
</template>
