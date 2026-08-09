<script setup lang="ts">
/**
 * The one place guesses appear — the viewer's own included. The caller puts it first when there is
 * one; this component only ever lays the list out. Before the viewer has guessed the backend
 * withholds everyone else's, so this list is legitimately empty — rendered as nothing at all, not
 * an empty box with nothing in it.
 */
import Avatar from '@/ui/Avatar.vue'
import type { LabEntryDto } from './types'

defineProps<{ entries: LabEntryDto[] }>()
</script>

<template>
  <ul v-if="entries.length > 0" data-test="lab-entries" class="mt-4 space-y-2">
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
      <code class="ml-auto text-xs text-neutral-500">
        {{ JSON.stringify(entry.guess)
        }}<template v-if="entry.outcome !== null"> → {{ JSON.stringify(entry.outcome) }}</template>
      </code>
    </li>
  </ul>
</template>
