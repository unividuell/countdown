<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getCommunity, updateCommunity, generateInvite } from '@/api/communities'

const route = useRoute()
const slug = String(route.params.slug)
const name = ref('')
const startsAt = ref('')
const phaseTwoStartRound = ref<number | null>(null)
const inviteUrl = ref<string | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  const c = await getCommunity(slug)
  name.value = c.name
  startsAt.value = c.startsAt ?? ''
  phaseTwoStartRound.value = c.phaseTwoStartRound
})

async function save(): Promise<void> {
  error.value = null
  try {
    await updateCommunity(slug, {
      name: name.value.trim(),
      startsAt: startsAt.value || undefined,
      phaseTwoStartRound: phaseTwoStartRound.value ?? undefined,
    })
  } catch {
    error.value = 'Speichern fehlgeschlagen.'
  }
}

async function invite(): Promise<void> {
  const r = await generateInvite(slug)
  inviteUrl.value = `${window.location.origin}${r.url}`
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
      <p class="text-xs text-neutral-500">URL-Slug <code>/{{ slug }}/</code> ist unveränderlich.</p>
      <label class="block text-sm"
        >Start (ISO)<input
          v-model="startsAt"
          class="mt-1 w-full rounded border px-3 py-1.5"
          placeholder="2026-09-01T11:00:00+02:00"
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
    <div class="mt-6">
      <button
        data-test="generate-invite"
        class="rounded border px-3 py-1.5 hover:bg-neutral-200"
        @click="invite"
      >
        Einladungslink erzeugen
      </button>
      <p v-if="inviteUrl" class="mt-2 break-all text-sm"><code>{{ inviteUrl }}</code></p>
    </div>
  </section>
</template>
