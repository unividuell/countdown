<script setup lang="ts">
import Avatar from '@/ui/Avatar.vue'
import type { LabEntryDto } from './types'

defineProps<{ entries: LabEntryDto[] }>()
</script>

<template>
  <ul data-test="lab-entries" class="mt-4 space-y-2">
    <li
      v-for="entry in entries"
      :key="entry.userId"
      class="flex items-center gap-3 rounded-md border border-neutral-200 p-2"
    >
      <Avatar
        :short-name="entry.avatar.shortName"
        :bg-color-hex="entry.avatar.bgColorHex"
        size="sm"
      />
      <span class="text-sm font-medium">{{ entry.username }}</span>
      <code class="ml-auto text-xs text-neutral-500">{{ JSON.stringify(entry.outcome) }}</code>
    </li>
  </ul>
</template>
