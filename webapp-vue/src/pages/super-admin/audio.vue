<script setup lang="ts">
import AudioPool from '@/audio/AudioPool.vue'
import { globalAudioBase } from '@/api/audio'
</script>

<template>
  <AudioPool :base="globalAudioBase()" />
</template>
