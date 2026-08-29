<script setup lang="ts">
/**
 * The lab's twin of the product's single-tip route — same component, same back-button reasoning
 * (see `pages/c/[slug]/rounds/[roundNumber]/tips/[userId].vue`). Seed and phase ride in the query
 * because they are the lab's round key, the same way a round number is the product's.
 *
 * `canOverride` arrives `true` from the server: in the lab everybody is the game master, so this
 * page needs no admin check of its own.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { castLabVote, openLabRound, setLabOverride } from '@/gamelab/api'
import type { LabPhase, LabRoundResponse } from '@/gamelab/types'
import type { Vote } from '@/api/types'
import { useCommunityContext } from '@/communities/context'
import type { GameEntry } from '@/games/GameEntry'
import { tipTiles } from '@/games/spotobject/tips'
import { isSpotObjectPayload } from '@/games/spotobject/types'
import TipDetail from '@/games/spotobject/TipDetail.vue'
import RoundSurface from '@/ui/RoundSurface.vue'
import { useAction } from '@/ui/useAction'

const route = useRoute('/c/[slug]/lab/[game]/tips/[userId]')
const { community } = useCommunityContext()

const gameId = computed(() => String(route.params.game))
const targetUserId = computed(() => String(route.params.userId))
const seed = computed(() => Number(route.query.seed))
const phase = computed<LabPhase>(() => (route.query.phase === 'TWO' ? 'TWO' : 'ONE'))

const round = ref<LabRoundResponse | null>(null)
const state = ref<'loading' | 'ready' | 'failed'>('loading')
const { busy, error: actionError, run } = useAction(() => 'Die Aktion ist fehlgeschlagen.')

async function load(): Promise<void> {
  state.value = 'loading'
  try {
    round.value = await openLabRound(community.value.slug, gameId.value, seed.value, phase.value)
    state.value = 'ready'
  } catch (err) {
    console.error('[lab tip] failed to load', err)
    state.value = 'failed'
  }
}

onMounted(load)

const payload = computed(() =>
  isSpotObjectPayload(round.value?.payload) ? round.value.payload : null,
)

/** Mine first, then everyone else's — mirrors the product page's own order. */
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

/** `round.me` stays null until a guess lands (see the lab's game page), so its presence is the
 * lab's own stand-in for the product's `guessedAt` — whoever has not played does not judge it. */
const canVote = computed(() => tile.value !== null && !tile.value.mine && round.value?.me !== null)
const canOverride = computed(() => round.value?.canOverride ?? false)

const myVote = computed<Vote | null>(() => {
  const mine = round.value?.me?.userId
  if (mine === undefined || tile.value === null) return null
  if (tile.value.confirms.some((vote) => vote.userId === mine)) return 'CONFIRM'
  if (tile.value.flags.some((vote) => vote.userId === mine)) return 'FLAG'
  return null
})

/** Back to the lab round this tip belongs to — a plain path, since seed and phase are the round
 * key rather than a named route param. */
const closeTo = computed(
  () => `/c/${community.value.slug}/lab/${gameId.value}?seed=${seed.value}&phase=${phase.value}`,
)

async function onVote(value: Vote | null): Promise<void> {
  await run(async () => {
    round.value = await castLabVote(
      community.value.slug,
      gameId.value,
      seed.value,
      phase.value,
      targetUserId.value,
      value,
    )
  })
}

async function onOverride(value: boolean | null): Promise<void> {
  await run(async () => {
    round.value = await setLabOverride(
      community.value.slug,
      gameId.value,
      seed.value,
      phase.value,
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
      :error="actionError"
      @vote="onVote"
      @override="onOverride"
    />
  </RoundSurface>
</template>
