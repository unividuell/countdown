<script setup lang="ts">
import type { QueueRow } from '@/ui/useUploadQueue'

defineProps<{ rows: QueueRow[] }>()
</script>

<template>
  <ul v-if="rows.length" class="mb-4 space-y-1.5 text-sm">
    <li v-for="(row, i) in rows" :key="i" data-test="queue-row">
      <!-- The reason gets its own line, full width: a message like „HEIC wird nicht
           unterstützt“ is far wider than a status word and must not fight the filename for
           room in one row, or squeeze it away and overflow a narrow phone. -->
      <div class="flex items-center justify-between gap-2">
        <span class="min-w-0 truncate">{{ row.name }}</span>
        <span v-if="row.state === 'running'" class="shrink-0"
          >{{ Math.round(row.progress * 100) }} %</span
        >
        <span v-else-if="row.state === 'done'" class="shrink-0 text-neutral-500">Fertig</span>
        <span v-else-if="row.state === 'failed'" class="shrink-0 text-red-600">Fehlgeschlagen</span>
        <span v-else class="shrink-0 text-neutral-400">Wartet</span>
      </div>
      <p v-if="row.state === 'failed'" class="text-xs text-red-600">{{ row.message }}</p>
    </li>
  </ul>
</template>
