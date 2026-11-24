<script setup lang="ts">
/**
 * Volume beside a game's transport: a vertical slider, the sound switch centred to its right.
 * The speaker is what tells the slider apart from any other control. Each is 32 px wide: beside
 * Anspielung's stop at 375 px, 44 px each would not fit (the frontend-ui tap-target exception).
 *
 *   ┃
 *   ┃  🔉
 *   ●
 */
import SoundToggle from './SoundToggle.vue'
import VolumeSlider from './VolumeSlider.vue'

const emit = defineEmits<{ adjust: []; press: []; release: [] }>()
</script>

<template>
  <span data-test="volume-control" class="flex shrink-0 items-center">
    <VolumeSlider
      vertical
      class="h-20 w-8"
      @adjust="emit('adjust')"
      @press="emit('press')"
      @release="emit('release')"
    />
    <SoundToggle
      data-test="volume-mute"
      class="flex h-11 w-8 cursor-pointer items-center justify-center rounded-full text-on-surface-variant"
    />
  </span>
</template>
