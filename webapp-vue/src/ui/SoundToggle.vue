<script setup lang="ts">
import IconVolume from '~icons/lucide/volume-2'
import IconMuted from '~icons/lucide/volume-x'
import { useGameSound } from './useGameSound'

const sound = useGameSound()
</script>

<template>
  <button type="button" aria-label="Ton" :aria-pressed="sound" @click="sound = !sound">
    <IconVolume v-if="sound" class="size-5" aria-hidden="true" />
    <IconMuted v-else class="size-5" aria-hidden="true" />
  </button>
</template>
