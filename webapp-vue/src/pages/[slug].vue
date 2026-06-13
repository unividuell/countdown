<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { getCommunity, setSelection } from '@/api/communities'
import { ApiError } from '@/api/client'
import type { CommunityResponse } from '@/api/types'
import CommunitySwitcher from '@/communities/CommunitySwitcher.vue'
import { useAuth } from '@/auth/useAuth'

const route = useRoute('/[slug]')
const router = useRouter()
const community = ref<CommunityResponse | null>(null)
const state = ref<'loading' | 'ready' | 'no-access'>('loading')
const { logout } = useAuth()

async function resolve(slug: string): Promise<void> {
  state.value = 'loading'
  try {
    community.value = await getCommunity(slug)
    state.value = 'ready'
    void setSelection(community.value.id) // remember last-selected
  } catch (e) {
    state.value = e instanceof ApiError && e.status === 404 ? 'no-access' : 'no-access'
    community.value = null
  }
}

onMounted(() => resolve(String(route.params.slug)))
watch(
  () => route.params.slug,
  (s) => resolve(String(s)),
)

async function handleLogout(): Promise<void> {
  await logout()
  router.replace('/login')
}
</script>

<template>
  <div v-if="state === 'loading'" class="py-8 text-center text-sm text-neutral-500">Lade…</div>
  <div v-else-if="state === 'no-access'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Kein Zugriff</h1>
    <p class="text-sm text-neutral-600">
      Diese Spielgemeinschaft existiert nicht oder du bist kein Mitglied.
    </p>
  </div>
  <div v-else>
    <header class="mb-4 flex items-center justify-between border-b px-4 py-2">
      <span class="font-semibold">{{ community?.name }}</span>
      <div class="flex items-center gap-2">
        <CommunitySwitcher :current-slug="community!.slug" />
        <button
          data-test="logout"
          class="rounded border px-2 py-1 text-sm hover:bg-neutral-200"
          @click="handleLogout"
        >
          Abmelden
        </button>
      </div>
    </header>
    <RouterView />
  </div>
</template>
