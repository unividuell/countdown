<script setup lang="ts">
import AudioPool from '@/audio/AudioPool.vue'
import { communityAudioBase } from '@/api/audio'
import { useCommunityContext } from '@/communities/context'

const { community } = useCommunityContext()
</script>

<template>
  <AudioPool :base="communityAudioBase(community.slug)" />
</template>
