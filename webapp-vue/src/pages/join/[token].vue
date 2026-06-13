<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { joinByToken } from '@/api/communities'
import { ApiError } from '@/api/client'

const route = useRoute('/join/[token]')
const router = useRouter()
const state = ref<'loading' | 'pending' | 'error'>('loading')
const message = ref('')

onMounted(async () => {
  try {
    const r = await joinByToken(route.params.token)
    if (r.status === 'ALREADY_ACTIVE') return router.replace(`/${r.slug}/`)
    state.value = 'pending'
    message.value = `Antrag für „${r.name}" gestellt — warte auf Bestätigung durch einen Spielleiter.`
  } catch (e) {
    state.value = 'error'
    message.value =
      e instanceof ApiError && e.status === 410
        ? 'Dieser Einladungslink ist abgelaufen.'
        : 'Dieser Einladungslink ist ungültig.'
  }
})
</script>

<template>
  <section class="mx-auto max-w-md py-8 text-center">
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Einladung wird geprüft…</p>
    <p v-else-if="state === 'pending'" class="text-sm">{{ message }}</p>
    <p v-else class="text-sm text-red-600">{{ message }}</p>
  </section>
</template>
