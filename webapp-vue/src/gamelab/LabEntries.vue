<script setup lang="ts">
/**
 * The one place guesses appear — the viewer's own included. The caller puts it first when there is
 * one; this component only ever lays the list out. Before the viewer has guessed the backend
 * withholds everyone else's, so this list is legitimately empty — rendered as nothing at all, not
 * an empty box with nothing in it.
 */
import IconRotateCcw from '~icons/lucide/rotate-ccw'
import IconTrash2 from '~icons/lucide/trash-2'
import Avatar from '@/ui/Avatar.vue'
import type { LabEntryDto } from './types'

defineProps<{
  entries: LabEntryDto[]
  busy?: boolean
  onForgetMine?: () => void
  onReset?: () => void
}>()
</script>

<template>
  <div v-if="entries.length > 0" class="mt-4">
    <ul data-test="lab-entries" class="space-y-2">
      <li
        v-for="(entry, idx) in entries"
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
          }}<template v-if="entry.outcome !== null">
            → {{ JSON.stringify(entry.outcome) }}</template
          >
        </code>
        <button
          v-if="idx === 0 && onForgetMine"
          type="button"
          data-test="lab-entry-forget-mine"
          :disabled="busy"
          aria-label="Meinen Tipp löschen"
          class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-default disabled:opacity-40"
          @click="onForgetMine"
        >
          <IconTrash2 class="size-4" />
        </button>
      </li>
    </ul>

    <div v-if="onReset" class="mt-2 flex justify-end">
      <button
        type="button"
        data-test="lab-entries-reset"
        :disabled="busy"
        class="flex h-11 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs text-neutral-500 hover:bg-neutral-100 disabled:cursor-default disabled:opacity-40"
        @click="onReset"
      >
        <IconRotateCcw class="size-3.5" />
        Runde zurücksetzen
      </button>
    </div>
  </div>
</template>
