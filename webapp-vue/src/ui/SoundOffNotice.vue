<script setup lang="ts">
/** Where the sound is the point, a muted device says so: the switch in the header is easy to miss. */
import { useGameVolume } from './useGameVolume'

const volume = useGameVolume()
</script>

<template>
  <p v-if="volume === 0" data-test="sound-off" class="text-sm font-semibold text-error">
    Ton ist aus
  </p>
</template>
