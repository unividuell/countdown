<script setup lang="ts">
/**
 * The two-column review grid: every tip of the round, at a glance. Deliberately not part of the
 * scoreboard below it — see `SpotObjectReveal.vue` for why the two stay apart.
 *
 * The tile is a `div`, not an `<a>`: it already carries a real link into Google, and an anchor
 * cannot nest inside another anchor.
 */
import { useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { googleUrl, shotUrl } from './types'
import type { TipTile } from './tips'

const props = defineProps<{
  tiles: TipTile[]
  tipPath: (userId: string) => RouteLocationRaw
}>()

const router = useRouter()

function open(userId: string): void {
  void router.push(props.tipPath(userId))
}
</script>

<template>
  <div data-test="tip-grid" class="grid grid-cols-2 gap-3">
    <div
      v-for="tile in props.tiles"
      :key="tile.userId"
      data-test="tip-tile"
      role="link"
      tabindex="0"
      class="cursor-pointer overflow-hidden rounded-lg bg-neutral-100 text-left"
      @click="open(tile.userId)"
      @keyup.enter="open(tile.userId)"
    >
      <div class="aspect-[4/3] bg-neutral-200">
        <img
          v-if="tile.tip"
          :src="shotUrl(tile.tip, 400, 300)"
          loading="lazy"
          alt=""
          class="h-full w-full object-cover"
        />
        <p v-else class="flex h-full items-center justify-center text-xs text-neutral-500">
          aufgegeben
        </p>
      </div>

      <div class="p-2 text-sm">
        <p
          class="truncate px-1 font-medium"
          :style="{ backgroundColor: tile.colorHex, color: tile.ink }"
        >
          <span v-if="tile.flag">{{ tile.flag }}</span> {{ tile.name }}
        </p>

        <p v-if="tile.struck" data-test="tip-struck" class="text-xs font-medium text-red-700">
          gestrichen
        </p>
        <!-- Plain and small on purpose — an exception a community admin occasionally reaches
             for, not a feature the reveal is organised around. -->
        <p v-if="tile.adminOverride === true" class="text-[11px] text-neutral-500">
          vom Spielleiter aufgehoben
        </p>
        <p v-else-if="tile.adminOverride === false" class="text-[11px] text-neutral-500">
          vom Spielleiter gestrichen
        </p>

        <p v-if="tile.confirms.length > 0" class="truncate text-xs text-neutral-600">
          ✓ {{ tile.confirms.map((vote) => vote.username).join(', ') }}
        </p>
        <p v-if="tile.flags.length > 0" class="truncate text-xs text-neutral-600">
          ⚑ {{ tile.flags.map((vote) => vote.username).join(', ') }}
        </p>

        <a
          v-if="tile.tip"
          :href="googleUrl(tile.tip)"
          target="_blank"
          rel="noopener"
          class="text-xs text-blue-700 underline"
          @click.stop
        >
          In Google Maps
        </a>
      </div>
    </div>
  </div>
</template>
