<script setup lang="ts">
/**
 * „Abgeschlossene Runden“ — the run's past under the running round, newest first.
 *
 * Renders nothing at all while there is no past: no seam, no hint. The closing line appears only
 * once somebody has actually walked to the beginning, which is why it replaces the button rather
 * than standing next to it.
 */
import { toRef } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { roundAssetUrl } from '@/api/rounds'
import ActionButton from '@/ui/ActionButton.vue'
import LabelledDivider from '@/ui/LabelledDivider.vue'
import RoundCard from '@/rounds/RoundCard.vue'
import { useRoundHistory } from '@/rounds/useRoundHistory'

const props = defineProps<{
  slug: string
  /** `previousRoundNumber` of the running round: the entry into the past, `null` for none. */
  from: number | null
}>()

const { items, busy, error, canLoadMore, loadMore } = useRoundHistory(
  props.slug,
  toRef(props, 'from'),
)

/**
 * One closure per round rather than one per card render would be cheaper, and is not needed:
 * `SongPlayerReveal` calls this only inside a click handler, so no watcher hangs off its identity.
 */
const assetUrlFor = (roundNumber: number) => (key: number) =>
  roundAssetUrl(props.slug, roundNumber, key)

/**
 * Same route `pages/c/[slug]/index.vue` points at, one per past round: the page's own loader
 * already falls back from `/current` to this exact round number, so a past round's tile opens the
 * same page a running round's does.
 */
const tipPathFor =
  (roundNumber: number) =>
  (userId: string): RouteLocationRaw => ({
    name: '/c/[slug]/rounds/[roundNumber]/tips/[userId]',
    params: { slug: props.slug, roundNumber: String(roundNumber), userId },
  })
</script>

<template>
  <template v-if="from !== null">
    <LabelledDivider class="mt-8">Abgeschlossene Runden</LabelledDivider>

    <!-- Keyed on the round number, the same measure `RoundCard` keys its game renderer on. -->
    <RoundCard
      v-for="item in items"
      :key="item.round?.number ?? 0"
      class="mt-6"
      :round="item"
      closed
      :asset-url="assetUrlFor(item.round?.number ?? 0)"
      :tip-path="tipPathFor(item.round?.number ?? 0)"
    />

    <p v-if="error" data-test="history-error" class="mt-6 text-sm text-neutral-500">{{ error }}</p>

    <div v-if="canLoadMore" class="mt-6 flex justify-center">
      <ActionButton data-test="history-more" :busy="busy" @click="loadMore">
        Weiter zurück
      </ActionButton>
    </div>
    <LabelledDivider v-else class="mt-8">Du bist ganz am Anfang angekommen</LabelledDivider>
  </template>
</template>
