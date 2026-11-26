<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DateTime } from 'luxon'
import { useClipboard } from '@vueuse/core'
import { updateCommunity, generateInvite, getInvite, revokeInvite } from '@/api/communities'
import { listGames, saveGameWeights } from '@/api/games'
import type { GameEntry, GameWeight } from '@/api/types'
import GameWeights from '@/communities/GameWeights.vue'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'
import { communityPath } from '@/communities/routes'
import EditionCalendar from '@/communities/edition/EditionCalendar.vue'
import { saveErrorMessage } from '@/profile/saveError'
import {
  MAX_CALENDAR_ROUNDS,
  calendarSpan,
  editionCells,
  frozenSince,
} from '@/communities/edition/editionGrid'

useAdminGuard()
const { community, refresh } = useCommunityContext()
const slug = community.value.slug
const name = ref('')
const inviteUrl = ref<string | null>(null)
const error = ref<string | null>(null)
const { copy, copied } = useClipboard()

// What the server holds, and the form's copy of it; only what differs is sent.
const games = ref<GameEntry[]>([])
const savedWeights = ref<Record<string, GameWeight>>({})
const weights = ref<Record<string, GameWeight>>({})
const weightsChanged = computed(() =>
  games.value.some((g) => weights.value[g.id] !== savedWeights.value[g.id]),
)

const edition = computed(() => community.value.edition)
const start = computed(() => {
  const e = edition.value
  if (!e) return ''

  return DateTime.fromISO(e.targetAt, { zone: e.targetTimezone })
    .setLocale('de')
    .toFormat('EEE, d. MMM yyyy, HH:mm')
})
const shape = computed(() => {
  const e = edition.value
  if (!e) return null

  return {
    targetAt: e.targetAt,
    zone: e.targetTimezone,
    gamesFromRound: e.gamesFromRound,
    gamesUntilRound: e.gamesUntilRound,
    phaseTwoStartRound: e.phaseTwoStartRound,
  }
})
const cells = computed(() => {
  const s = shape.value
  if (!s || calendarSpan(s) > MAX_CALENDAR_ROUNDS) return []

  return editionCells(s, DateTime.now())
})
const frozenNote = computed(() => {
  const s = shape.value
  if (!s) return ''

  const at = frozenSince(s.targetAt, s.zone, s.gamesFromRound)
  const when = at.setLocale('de').toFormat('EEE, d. MMM yyyy HH:mm')

  return `Ziel und Zeitzone sind ${at <= DateTime.now() ? 'seit' : 'ab'} ${when} fest.`
})

function fullUrl(path: string): string {
  return `${window.location.origin}${path}`
}

// The name field follows the context, e.g. after a refresh.
watch(
  () => community.value.name,
  (n) => (name.value = n),
  { immediate: true },
)

onMounted(async () => {
  const inv = await getInvite(slug)
  inviteUrl.value = inv ? fullUrl(inv.url) : null
})

onMounted(async () => {
  const list = await listGames(slug)
  games.value = list
  savedWeights.value = Object.fromEntries(list.map((g) => [g.id, g.weight]))
  weights.value = { ...savedWeights.value }
})

async function save(): Promise<void> {
  error.value = null
  if (games.value.length && games.value.every((g) => weights.value[g.id] === 'OFF')) {
    error.value = 'Mindestens ein Spiel muss an bleiben.'
    return
  }

  try {
    // Name first: on a failed weights save the renamed community is already stored and shown.
    if (name.value.trim() !== community.value.name) {
      await updateCommunity(slug, name.value.trim())
      await refresh()
    }
    if (weightsChanged.value) {
      await saveGameWeights(slug, weights.value)
      savedWeights.value = { ...weights.value }
    }
  } catch (e) {
    error.value = saveErrorMessage(e)
  }
}
async function regenerate(): Promise<void> {
  const r = await generateInvite(slug)
  inviteUrl.value = fullUrl(r.url)
}
async function revoke(): Promise<void> {
  await revokeInvite(slug)
  inviteUrl.value = null
}
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Einstellungen</h1>
    <form class="space-y-3" @submit.prevent="save">
      <label class="block text-sm"
        >Name<input
          v-model="name"
          class="mt-1 w-full rounded border px-3 py-1.5"
          minlength="3"
          maxlength="50"
      /></label>
      <p class="text-xs text-on-surface-variant">
        URL-Slug <code>{{ communityPath(slug) }}</code> ist unveränderlich.
      </p>
      <div v-if="games.length" data-test="game-weights" class="pt-3">
        <h2 class="mb-2 font-medium">Spiele</h2>
        <GameWeights v-model="weights" :games="games" />
        <p class="mt-2 text-xs text-on-surface-variant">
          Gilt ab der nächsten angekündigten Runde.
        </p>
      </div>
      <button class="rounded border px-3 py-1.5 hover:bg-surface-container-highest">
        Speichern
      </button>
      <p v-if="error" class="text-sm text-error">{{ error }}</p>
    </form>

    <div class="mt-6 border-t pt-4">
      <h2 class="mb-2 font-medium">Edition</h2>
      <div v-if="edition" class="space-y-3">
        <p data-test="edition-title" class="text-sm">{{ edition.label ?? community.name }}</p>
        <p data-test="edition-start" class="text-sm text-on-surface-variant">{{ start }}</p>
        <EditionCalendar :cells="cells" />
        <p data-test="edition-frozen-since" class="text-xs text-on-surface-variant">
          {{ frozenNote }}
        </p>
        <RouterLink
          :to="communityPath(slug, 'edition')"
          class="inline-block rounded border px-3 py-1.5 hover:bg-surface-container-highest"
          >Edition bearbeiten</RouterLink
        >
      </div>
      <div v-else>
        <p class="mb-2 text-sm text-on-surface-variant">Kein Lauf aktiv.</p>
        <RouterLink
          :to="communityPath(slug, 'edition')"
          class="inline-block rounded border px-3 py-1.5 hover:bg-surface-container-highest"
          >Edition erzeugen</RouterLink
        >
      </div>
    </div>

    <div class="mt-6 border-t pt-4">
      <h2 class="mb-2 font-medium">Einladungslink</h2>
      <div v-if="inviteUrl" class="space-y-2">
        <p class="break-all text-sm">
          <code>{{ inviteUrl }}</code>
        </p>
        <div class="flex gap-2">
          <button
            class="rounded border px-2 py-1 text-sm hover:bg-surface-container-highest"
            @click="copy(inviteUrl ?? '')"
          >
            {{ copied ? 'Kopiert!' : 'Kopieren' }}
          </button>
          <button
            class="rounded border px-2 py-1 text-sm hover:bg-surface-container-highest"
            @click="regenerate"
          >
            Neu generieren
          </button>
          <button
            data-test="revoke-invite"
            class="rounded border px-2 py-1 text-sm text-error hover:bg-surface-container-highest"
            @click="revoke"
          >
            Widerrufen
          </button>
        </div>
      </div>
      <div v-else>
        <p class="mb-2 text-sm text-on-surface-variant">Kein aktiver Einladungslink.</p>
        <button
          data-test="generate-invite"
          class="rounded border px-3 py-1.5 hover:bg-surface-container-highest"
          @click="regenerate"
        >
          Einladungslink erzeugen
        </button>
      </div>
    </div>
  </section>
</template>
