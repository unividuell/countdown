<script setup lang="ts">
import MessageCard from '@/communities/fallbacks/MessageCard.vue'
import { RUNNING_MESSAGE } from '@/communities/fallbacks/messages'
</script>

<template>
  <MessageCard v-bind="RUNNING_MESSAGE" />
</template>
