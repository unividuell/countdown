<script setup lang="ts">
/**
 * „Abgeschlossene Runden“ — the run's past under the running round, newest first.
 *
 * Renders nothing at all while there is no past: no seam, no hint. The closing line appears only
 * once somebody has actually walked to the beginning, which is why it replaces the button rather
 * than standing next to it.
 */
import { ref, toRef } from 'vue'
import { castVote, roundAssetUrl, setAdminOverride } from '@/api/rounds'
import type { RoundResponse } from '@/api/types'
import ActionButton from '@/ui/ActionButton.vue'
import LabelledDivider from '@/ui/LabelledDivider.vue'
import RoundCard from '@/rounds/RoundCard.vue'
import type { RoundReview } from '@/rounds/review'
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
 * The review of a past round, written back into the item it belongs to — the server answers each
 * ballot with that whole round, so the card re-renders from the server's own re-evaluation.
 *
 * Only the round immediately before the running one is still open for review; the server refuses
 * anything older, and the failure surfaces where every other failed action does.
 */
function reviewFor(roundNumber: number): RoundReview {
  const ballot = async (action: () => Promise<RoundResponse>): Promise<void> => {
    reviewNotice.value = null
    try {
      const loaded = await action()
      items.value = items.value.map((item) => (item.round?.number === roundNumber ? loaded : item))
    } catch (err) {
      console.error('[review] ballot failed', err)
      reviewNotice.value = { roundNumber, text: 'Die Wertung konnte nicht gespeichert werden.' }
    }
  }
  return {
    // `from` is the round immediately before the running one — the last one the server's review
    // window still covers. Everything further back is read-only, and offering a control there
    // would only produce a 404 per press.
    open: roundNumber === props.from,
    canOverride: items.value.find((i) => i.round?.number === roundNumber)?.canOverride ?? false,
    vote: (userId, value) => ballot(() => castVote(props.slug, roundNumber, userId, value)),
    override: (userId, value) =>
      ballot(() => setAdminOverride(props.slug, roundNumber, userId, value)),
  }
}

/** Carried with its round number, so the sentence lands on the card it is about and on no other. */
const reviewNotice = ref<{ roundNumber: number; text: string } | null>(null)
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
      :review="reviewFor(item.round?.number ?? 0)"
      :notice="
        reviewNotice && reviewNotice.roundNumber === item.round?.number ? reviewNotice.text : null
      "
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
