<script setup lang="ts">
import ImagePool from '@/images/ImagePool.vue'
import { communityImagesBase } from '@/api/images'
import { useCommunityContext } from '@/communities/context'

const { community } = useCommunityContext()
</script>

<template>
  <ImagePool :base="communityImagesBase(community.slug)" />
</template>
