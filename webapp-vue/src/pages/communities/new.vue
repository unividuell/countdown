<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '@/ui/ActionButton.vue'
import { useAction } from '@/ui/useAction'
import { slugify } from '@/lib/slugify'
import { createCommunity } from '@/api/communities'
import { ApiError } from '@/api/client'
import { communityPath } from '@/communities/routes'
import { useCommunityCreationGuard } from '@/communities/useCommunityCreationGuard'

useCommunityCreationGuard()

const router = useRouter()
const name = ref('')
const slug = computed(() => slugify(name.value))
const tooShort = computed(() => slug.value.length < 3)

const { busy, error, run } = useAction((e) =>
  e instanceof ApiError && e.status === 409
    ? 'Dieser Name ergibt einen bereits vergebenen Slug — bitte Namen anpassen.'
    : 'Erstellen fehlgeschlagen. Bitte erneut versuchen.',
)

async function submit(): Promise<void> {
  await run(async () => {
    const c = await createCommunity(name.value.trim())
    await router.replace(communityPath(c.slug))
  })
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
        URL: <code>{{ communityPath(slug || '…') }}</code>
        <span v-if="name && tooShort" class="text-amber-600"> (mind. 3 Zeichen)</span>
      </p>
      <ActionButton type="submit" class="mt-4" :busy="busy" :disabled="tooShort">
        Erstellen
      </ActionButton>
      <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>
    </form>
  </section>
</template>
