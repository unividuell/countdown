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

type BoxTone = 'info' | 'phase-two'

const props = withDefaults(defineProps<{ storageKey: string; tone?: BoxTone }>(), {
  tone: 'info',
})

/** Border and ground per tone. The icon carries the tone's colour itself — see the template. */
const TONES: Record<BoxTone, string> = {
  info: 'border-sky-200 bg-sky-50/60',
  'phase-two': 'border-phase-two/30 bg-phase-two/10',
}

const collapsed = useLocalStorage(`infobox:${props.storageKey}`, false)
</script>

<template>
  <section
    data-test="info-box"
    class="rounded-lg border px-4 py-3 text-sm text-neutral-700"
    :class="TONES[tone]"
  >
    <div class="flex items-start gap-3">
      <!-- No nudge: the icon's box and the heading's first line box are both 20px, so aligning
           them at the top is what puts them on one line. A margin here only lifts the heading. -->
      <!-- Coloured on this span, not inherited: `text-neutral-700` already sits on the section for
           the body text, and a second `text-*` there would be a coin flip on which one wins. -->
      <span
        data-test="info-box-icon"
        class="shrink-0"
        :class="tone === 'phase-two' ? 'text-phase-two' : 'text-sky-600'"
      >
        <slot name="icon"><IconInfo class="size-5" aria-hidden="true" /></slot>
      </span>
      <div class="min-w-0 flex-1 font-medium"><slot name="abstract" /></div>
      <!-- The button is 44px tall with centred content in an `items-start` row. Without
           correction, the 20px chevron sits at −8 + 22 = 14px, four pixels below the icon and
           heading's centre line. −12px margins top and bottom move it to 10px (the centre) and
           keep the hit area at 20px (44 − 12 − 12 = 20px). -->
      <button
        type="button"
        data-test="info-box-toggle"
        class="-mx-2 -mt-3 -mb-3 flex size-11 shrink-0 cursor-pointer items-center justify-center text-neutral-500"
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
