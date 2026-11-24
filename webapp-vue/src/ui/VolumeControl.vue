<script setup lang="ts">
/**
 * Volume beside a game's transport: a vertical slider whose knob is the speaker — that is what
 * tells it apart from any other control. Mute stays in the header. The caller gives the height:
 * the transport row's, all of it.
 */
import VolumeSlider from './VolumeSlider.vue'

const emit = defineEmits<{ adjust: []; press: []; release: [] }>()
</script>

<template>
  <VolumeSlider
    vertical
    data-test="volume-control"
    class="w-11 shrink-0"
    @adjust="emit('adjust')"
    @press="emit('press')"
    @release="emit('release')"
  />
</template>
