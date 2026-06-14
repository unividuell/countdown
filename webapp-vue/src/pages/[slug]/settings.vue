<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { DateTime } from 'luxon'
import { useClipboard } from '@vueuse/core'
import {
  getCommunity,
  updateCommunity,
  generateInvite,
  getInvite,
  revokeInvite,
} from '@/api/communities'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'

useAdminGuard()
const { community, refresh } = useCommunityContext()
const slug = community.value.slug
const name = ref('')
const startsAt = ref('')
const startsAtTimezone = ref('Europe/Berlin')
const zones = Intl.supportedValuesOf('timeZone')
const phaseTwoStartRound = ref<number | null>(null)
const inviteUrl = ref<string | null>(null)
const error = ref<string | null>(null)
const { copy, copied } = useClipboard()

function fullUrl(path: string): string {
  return `${window.location.origin}${path}`
}

// <input type="datetime-local"> holds a zone-less wall-clock string. We interpret it IN the
// community's startsAtTimezone (not the browser zone): instant <-> "yyyy-MM-dd'T'HH:mm" in that zone.
function toLocalInput(iso: string, zone: string): string {
  return DateTime.fromISO(iso, { zone }).toFormat("yyyy-MM-dd'T'HH:mm")
}
function toInstant(local: string, zone: string): string | null {
  return DateTime.fromISO(local, { zone }).toUTC().toISO()
}

onMounted(async () => {
  const c = await getCommunity(slug)
  name.value = c.name
  startsAtTimezone.value = c.startsAtTimezone
  startsAt.value = c.startsAt ? toLocalInput(c.startsAt, c.startsAtTimezone) : ''
  phaseTwoStartRound.value = c.phaseTwoStartRound
  const inv = await getInvite(slug)
  inviteUrl.value = inv ? fullUrl(inv.url) : null
})

async function save(): Promise<void> {
  error.value = null
  try {
    const body: Partial<{
      name: string
      startsAt: string
      startsAtTimezone: string
      phaseTwoStartRound: number
    }> = { name: name.value.trim(), startsAtTimezone: startsAtTimezone.value }
    if (startsAt.value) {
      const instant = toInstant(startsAt.value, startsAtTimezone.value)
      if (instant) body.startsAt = instant
    }
    if (phaseTwoStartRound.value !== null) body.phaseTwoStartRound = phaseTwoStartRound.value
    await updateCommunity(slug, body)
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
        URL-Slug <code>/{{ slug }}/</code> ist unveränderlich.
      </p>
      <label class="block text-sm"
        >Zeitzone<select
          v-model="startsAtTimezone"
          class="mt-1 w-full rounded border px-3 py-1.5"
        >
          <option v-for="z in zones" :key="z" :value="z">{{ z }}</option>
        </select></label
      >
      <label class="block text-sm"
        >Start<input
          v-model="startsAt"
          type="datetime-local"
          class="mt-1 w-full rounded border px-3 py-1.5"
      /></label>
      <label class="block text-sm"
        >Phase-2-Startrunde<input
          v-model.number="phaseTwoStartRound"
          type="number"
          min="1"
          class="mt-1 w-full rounded border px-3 py-1.5"
      /></label>
      <button class="rounded border px-3 py-1.5 hover:bg-neutral-200">Speichern</button>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    </form>

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
