<script setup lang="ts">
import ImagePool from '@/images/ImagePool.vue'
import { globalImagesBase } from '@/api/images'
</script>

<template>
  <ImagePool :base="globalImagesBase()" />
</template>
