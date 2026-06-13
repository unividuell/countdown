<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { slugify } from '@/lib/slugify'
import { createCommunity } from '@/api/communities'
import { ApiError } from '@/api/client'

const router = useRouter()
const name = ref('')
const error = ref<string | null>(null)
const slug = computed(() => slugify(name.value))
const tooShort = computed(() => slug.value.length < 3)

async function submit(): Promise<void> {
  error.value = null
  try {
    const c = await createCommunity(name.value.trim())
    router.replace(`/${c.slug}/`)
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 409
        ? 'Dieser Name ergibt einen bereits vergebenen/reservierten Slug — bitte Namen anpassen.'
        : 'Erstellen fehlgeschlagen. Bitte erneut versuchen.'
  }
}
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Spielgemeinschaft erstellen</h1>
    <form @submit.prevent="submit">
      <label class="block text-sm font-medium" for="name">Name</label>
      <input
        id="name"
        v-model="name"
        class="mt-1 w-full rounded border px-3 py-1.5"
        minlength="3"
        maxlength="50"
        required
      />
      <p class="mt-2 text-sm text-neutral-500">
        URL: <code>/{{ slug || '…' }}/</code>
        <span v-if="name && tooShort" class="text-amber-600"> (mind. 3 Zeichen)</span>
      </p>
      <button class="mt-4 rounded border px-3 py-1.5 hover:bg-neutral-200" :disabled="tooShort">
        Erstellen
      </button>
      <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>
    </form>
  </section>
</template>
