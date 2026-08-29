<script setup lang="ts">
/**
 * One tip, on its own URL.
 *
 * A route rather than a modal, for the back button: with its own URL the phone's back gesture
 * closes the tip, and that is the one thing a modal cannot give.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { castVote, getCurrentRound, getRound, setAdminOverride } from '@/api/rounds'
import type { RoundResponse, Vote } from '@/api/types'
import { useCommunityContext } from '@/communities/context'
import { communityPath } from '@/communities/routes'
import type { GameEntry } from '@/games/GameEntry'
import { tipTiles } from '@/games/spotobject/tips'
import { isSpotObjectPayload } from '@/games/spotobject/types'
import TipDetail from '@/games/spotobject/TipDetail.vue'
import RoundSurface from '@/ui/RoundSurface.vue'
import { useAction } from '@/ui/useAction'

const route = useRoute('/c/[slug]/rounds/[roundNumber]/tips/[userId]')
const { community } = useCommunityContext()

const roundNumber = computed(() => Number(route.params.roundNumber))
const targetUserId = computed(() => String(route.params.userId))

const round = ref<RoundResponse | null>(null)
const state = ref<'loading' | 'ready' | 'failed'>('loading')
const { busy, run } = useAction(() => 'Die Aktion ist fehlgeschlagen.')

/**
 * The running round answers under `/current`; anything older has its own number. Asking `/current`
 * first is one request in the common case and two in the rare one, and it avoids having to know
 * which is which before asking.
 */
async function load(): Promise<void> {
  state.value = 'loading'
  try {
    const current = await getCurrentRound(community.value.slug)
    round.value =
      current.round?.number === roundNumber.value
        ? current
        : await getRound(community.value.slug, roundNumber.value)
    state.value = 'ready'
  } catch (err) {
    console.error('[tip] failed to load', err)
    state.value = 'failed'
  }
}

onMounted(load)

const payload = computed(() =>
  isSpotObjectPayload(round.value?.payload) ? round.value.payload : null,
)

/** Mine first, then everyone else's — the same order `RoundCard` builds its entries in. */
const entries = computed<GameEntry[]>(() => {
  const me = round.value?.me ?? null
  const others = round.value?.others ?? []
  return me ? [me, ...others] : others
})

const tile = computed(() => {
  if (payload.value === null) return null
  const tiles = tipTiles({ entries: entries.value, mineUserId: round.value?.me?.userId ?? null })
  return tiles.find((t) => t.userId === targetUserId.value) ?? null
})

/** Whoever did not play the round does not judge it — mirrors the server's own rule. */
const canVote = computed(
  () => tile.value !== null && !tile.value.mine && round.value?.me?.guessedAt != null,
)
const canOverride = computed(() => round.value?.canOverride ?? false)

const myVote = computed<Vote | null>(() => {
  const mine = round.value?.me?.userId
  if (mine === undefined || tile.value === null) return null
  if (tile.value.confirms.some((vote) => vote.userId === mine)) return 'CONFIRM'
  if (tile.value.flags.some((vote) => vote.userId === mine)) return 'FLAG'
  return null
})

const closeTo = computed(() => communityPath(community.value.slug))

/** The server sends the whole round back, so nothing here is derived locally. */
async function onVote(value: Vote | null): Promise<void> {
  await run(async () => {
    round.value = await castVote(community.value.slug, roundNumber.value, targetUserId.value, value)
  })
}

async function onOverride(value: boolean | null): Promise<void> {
  await run(async () => {
    round.value = await setAdminOverride(
      community.value.slug,
      roundNumber.value,
      targetUserId.value,
      value,
    )
  })
}
</script>

<template>
  <p v-if="state === 'loading'" data-test="tip-loading" class="text-sm text-neutral-500">Lade…</p>
  <p v-else-if="state === 'failed'" data-test="tip-error" class="text-sm text-neutral-500">
    Die Runde konnte nicht geladen werden.
  </p>
  <p v-else-if="tile === null" data-test="tip-missing" class="text-sm text-neutral-500">
    Dieser Tipp lässt sich hier nicht finden.
  </p>
  <RoundSurface v-else>
    <TipDetail
      :tile="tile"
      :term="payload?.term ?? ''"
      :can-vote="canVote"
      :can-override="canOverride"
      :my-vote="myVote"
      :busy="busy"
      :close-to="closeTo"
      @vote="onVote"
      @override="onOverride"
    />
  </RoundSurface>
</template>
