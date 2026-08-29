<script setup lang="ts">
/**
 * One tip, large: the still image, the close control, and the vote pair beneath it. Shared content
 * for both worlds' single-tip routes — the page mounts `RoundSurface` around this, exactly as
 * `RoundCard.vue` mounts it around a game's own component.
 *
 * Confirm and flag are a judgement between equals, so neither carries more visual weight than the
 * other — same size, same font weight, only the colour differs. The override sits below, plain and
 * small: an exception a game master occasionally reaches for, not a feature this page is built
 * around (mirrors `SpotObjectTipGrid.vue`'s own note on the same control).
 */
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import type { Vote } from '@/api/types'
import { googleUrl, shotUrl } from './types'
import type { TipTile } from './tips'

const props = defineProps<{
  tile: TipTile
  term: string
  canVote: boolean
  canOverride: boolean
  myVote: Vote | null
  busy: boolean
  closeTo: RouteLocationRaw
  /** `useAction`'s own message for the last vote/override attempt — `null` while nothing failed. */
  error: string | null
}>()

const emit = defineEmits<{ vote: [Vote | null]; override: [boolean | null] }>()

/** A second click on the held vote withdraws it — voting is idempotent, not additive. */
function toggleVote(value: Vote): void {
  emit('vote', props.myVote === value ? null : value)
}
</script>

<template>
  <div>
    <!-- Same stage measurements as the board: the one thing here that has to run edge to edge. -->
    <div class="relative -m-4 h-[100dvh] sm:h-[min(100dvh-6rem,40rem)]">
      <img
        v-if="props.tile.tip"
        :src="shotUrl(props.tile.tip, 800, 800)"
        alt=""
        class="absolute inset-0 h-full w-full object-cover"
      />
      <p
        v-else
        class="absolute inset-0 flex items-center justify-center bg-neutral-200 text-sm text-neutral-500"
      >
        aufgegeben
      </p>

      <RouterLink
        data-test="tip-close"
        :to="props.closeTo"
        class="absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg text-neutral-900 shadow"
      >
        <span aria-hidden="true">✕</span>
        <span class="sr-only">Schließen</span>
      </RouterLink>
    </div>

    <div class="mt-4 flex flex-col gap-3">
      <p class="text-sm font-medium text-neutral-900">
        <span v-if="props.tile.flag">{{ props.tile.flag }}</span> {{ props.tile.name }} — „{{
          props.term
        }}“
      </p>

      <!-- Half each, same height, same font weight: only the colour separates them. Nothing about
           the layout may suggest one direction over the other. -->
      <div v-if="props.canVote" class="flex gap-2">
        <button
          type="button"
          data-test="tip-confirm"
          class="h-11 flex-1 basis-0 rounded-md text-sm font-semibold disabled:cursor-default disabled:opacity-40"
          :class="
            props.myVote === 'CONFIRM'
              ? 'bg-emerald-600 text-white'
              : 'bg-emerald-100 text-emerald-900'
          "
          :disabled="props.busy"
          @click="toggleVote('CONFIRM')"
        >
          Bestätigen
        </button>
        <button
          type="button"
          data-test="tip-flag"
          class="h-11 flex-1 basis-0 rounded-md text-sm font-semibold disabled:cursor-default disabled:opacity-40"
          :class="props.myVote === 'FLAG' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-900'"
          :disabled="props.busy"
          @click="toggleVote('FLAG')"
        >
          Flaggen
        </button>
      </div>

      <!-- Same spot the profile blocks put a failed save's message: right under the controls that
           produced it. Shared by both vote and override — this page has one action at a time. -->
      <p v-if="props.error" data-test="tip-action-error" class="mt-2 text-sm text-red-600">
        {{ props.error }}
      </p>

      <p v-if="props.tile.struck" data-test="tip-struck" class="text-sm font-medium text-red-700">
        gestrichen
      </p>

      <p v-if="props.tile.confirms.length > 0" class="text-sm text-neutral-600">
        ✓ {{ props.tile.confirms.map((vote) => vote.username).join(', ') }}
      </p>
      <p v-if="props.tile.flags.length > 0" class="text-sm text-neutral-600">
        ⚑ {{ props.tile.flags.map((vote) => vote.username).join(', ') }}
      </p>

      <!-- Plain and small on purpose — the same reasoning as the grid's own override note. -->
      <div v-if="props.canOverride" data-test="tip-override" class="flex gap-3 text-[11px]">
        <button
          type="button"
          class="text-neutral-500 underline disabled:no-underline"
          :disabled="props.busy"
          @click="emit('override', null)"
        >
          Wertung überlassen
        </button>
        <button
          type="button"
          class="text-neutral-500 underline disabled:no-underline"
          :disabled="props.busy"
          @click="emit('override', true)"
        >
          Zählen lassen
        </button>
        <button
          type="button"
          class="text-neutral-500 underline disabled:no-underline"
          :disabled="props.busy"
          @click="emit('override', false)"
        >
          Streichen
        </button>
      </div>

      <a
        v-if="props.tile.tip"
        data-test="tip-google"
        :href="googleUrl(props.tile.tip)"
        target="_blank"
        rel="noopener"
        class="text-xs text-blue-700 underline"
      >
        In Google Maps
      </a>
    </div>
  </div>
</template>
