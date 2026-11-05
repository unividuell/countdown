<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DateTime } from 'luxon'
import { useClipboard } from '@vueuse/core'
import { updateCommunity, generateInvite, getInvite, revokeInvite } from '@/api/communities'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'
import { communityPath } from '@/communities/routes'
import EditionCalendar from '@/communities/edition/EditionCalendar.vue'
import { editionCells } from '@/communities/edition/editionGrid'

useAdminGuard()
const { community, refresh } = useCommunityContext()
const slug = community.value.slug
const name = ref('')
const inviteUrl = ref<string | null>(null)
const error = ref<string | null>(null)
const { copy, copied } = useClipboard()

const edition = computed(() => community.value.edition)
const start = computed(() => {
  const e = edition.value
  if (!e) return ''

  return DateTime.fromISO(e.startsAt, { zone: e.startsAtTimezone })
    .setLocale('de')
    .toFormat('EEE, d. MMM yyyy, HH:mm')
})
const cells = computed(() => {
  const e = edition.value
  if (!e) return []

  return editionCells(
    {
      startsAt: e.startsAt,
      zone: e.startsAtTimezone,
      gamesFromRound: e.gamesFromRound,
      gamesUntilRound: e.gamesUntilRound,
      phaseTwoStartRound: e.phaseTwoStartRound,
    },
    DateTime.now(),
  )
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

async function save(): Promise<void> {
  error.value = null
  try {
    await updateCommunity(slug, name.value.trim())
    await refresh()
  } catch {
    error.value = 'Speichern fehlgeschlagen.'
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
      <p class="text-xs text-neutral-500">
        URL-Slug <code>{{ communityPath(slug) }}</code> ist unveränderlich.
      </p>
      <button class="rounded border px-3 py-1.5 hover:bg-neutral-200">Speichern</button>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    </form>

    <div class="mt-6 border-t pt-4">
      <h2 class="mb-2 font-medium">Edition</h2>
      <div v-if="edition" class="space-y-3">
        <p data-test="edition-title" class="text-sm">{{ edition.label ?? community.name }}</p>
        <p data-test="edition-start" class="text-sm text-neutral-600">{{ start }}</p>
        <EditionCalendar :cells="cells" />
        <RouterLink
          :to="communityPath(slug, 'edition')"
          class="inline-block rounded border px-3 py-1.5 hover:bg-neutral-200"
          >Edition bearbeiten</RouterLink
        >
      </div>
      <div v-else>
        <p class="mb-2 text-sm text-neutral-500">Kein Lauf aktiv.</p>
        <RouterLink
          :to="communityPath(slug, 'edition')"
          class="inline-block rounded border px-3 py-1.5 hover:bg-neutral-200"
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
            class="rounded border px-2 py-1 text-sm hover:bg-neutral-200"
            @click="copy(inviteUrl ?? '')"
          >
            {{ copied ? 'Kopiert!' : 'Kopieren' }}
          </button>
          <button class="rounded border px-2 py-1 text-sm hover:bg-neutral-200" @click="regenerate">
            Neu generieren
          </button>
          <button
            data-test="revoke-invite"
            class="rounded border px-2 py-1 text-sm text-red-600 hover:bg-neutral-200"
            @click="revoke"
          >
            Widerrufen
          </button>
        </div>
      </div>
      <div v-else>
        <p class="mb-2 text-sm text-neutral-500">Kein aktiver Einladungslink.</p>
        <button
          data-test="generate-invite"
          class="rounded border px-3 py-1.5 hover:bg-neutral-200"
          @click="regenerate"
        >
          Einladungslink erzeugen
        </button>
      </div>
    </div>
  </section>
</template>
