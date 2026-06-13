<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useCommunities } from '@/communities/useCommunities'
import { useAuth } from '@/auth/useAuth'

const { active, refresh } = useCommunities()
const { logout } = useAuth()
const router = useRouter()

onMounted(refresh)

async function handleLogout(): Promise<void> {
  await logout()
  router.replace('/login')
}
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold">Deine Spielgemeinschaften</h1>
      <button
        data-test="logout"
        class="rounded border px-3 py-1.5 text-sm hover:bg-neutral-200"
        @click="handleLogout"
      >
        Abmelden
      </button>
    </div>
    <ul v-if="active.length" class="mb-6 space-y-2">
      <li v-for="c in active" :key="c.id">
        <RouterLink :to="`/${c.slug}/`" class="text-blue-700 hover:underline">{{
          c.name
        }}</RouterLink>
      </li>
    </ul>
    <p v-else class="mb-6 text-sm text-neutral-600">
      Du bist noch in keiner Spielgemeinschaft. Erstelle eine — oder öffne einen Einladungslink,
      den du erhalten hast.
    </p>
    <RouterLink to="/communities/new" class="rounded border px-3 py-1.5 hover:bg-neutral-200"
      >Spielgemeinschaft erstellen</RouterLink
    >
  </section>
</template>
