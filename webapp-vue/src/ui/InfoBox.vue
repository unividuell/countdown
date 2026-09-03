<script setup lang="ts">
/**
 * An explanation that can be put away for good: the abstract always shows, the rest folds, and the
 * fold is remembered per [storageKey].
 *
 * The key is the game's id, not the round: whoever has understood a game has understood it for every
 * round of it. The original kept the same decision server-side per user and game type; `localStorage`
 * costs no table and no request, and its one weakness — a new device unfolds again — lands exactly
 * where the explanation is welcome anyway.
 *
 * Mechanics only. Every word the reader sees comes from the slots, so nothing here knows a game.
 */
import { useLocalStorage } from '@vueuse/core'
import IconInfo from '~icons/lucide/info'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconChevronUp from '~icons/lucide/chevron-up'

const props = defineProps<{ storageKey: string }>()

const collapsed = useLocalStorage(`infobox:${props.storageKey}`, false)
</script>

<template>
  <section
    data-test="info-box"
    class="rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-neutral-700"
  >
    <div class="flex items-start gap-3">
      <!-- No nudge: the icon's box and the heading's first line box are both 20px, so aligning
           them at the top is what puts them on one line. A margin here only lifts the heading. -->
      <IconInfo class="size-5 shrink-0 text-sky-600" aria-hidden="true" />
      <div class="min-w-0 flex-1 font-medium"><slot name="abstract" /></div>
      <button
        type="button"
        data-test="info-box-toggle"
        class="-m-2 flex size-11 shrink-0 cursor-pointer items-center justify-center text-neutral-500"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? 'Erklärung zeigen' : 'Erklärung ausblenden'"
        @click="collapsed = !collapsed"
      >
        <IconChevronUp v-if="!collapsed" class="size-5" />
        <IconChevronDown v-else class="size-5" />
      </button>
    </div>
    <div v-if="!collapsed" data-test="info-box-body" class="mt-3 flex flex-col gap-2">
      <slot />
    </div>
  </section>
</template>
