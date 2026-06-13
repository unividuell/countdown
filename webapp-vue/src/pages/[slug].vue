<script setup lang="ts">
import { onMounted, provide, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { getCommunity, setSelection } from '@/api/communities'
import { ApiError } from '@/api/client'
import type { CommunityResponse } from '@/api/types'
import CommunitySwitcher from '@/communities/CommunitySwitcher.vue'
import { useAuth } from '@/auth/useAuth'
import { communityKey } from '@/communities/context'

const route = useRoute('/[slug]')
const router = useRouter()
const community = ref<CommunityResponse | null>(null)
const state = ref<'loading' | 'ready' | 'no-access' | 'error'>('loading')
const adminMenuOpen = ref(false)
const { logout } = useAuth()

async function resolve(slug: string): Promise<void> {
  state.value = 'loading'
  try {
    community.value = await getCommunity(slug)
    state.value = 'ready'
    void setSelection(community.value.id)
  } catch (e) {
    state.value = e instanceof ApiError && e.status === 404 ? 'no-access' : 'error'
    community.value = null
  }
}
async function refresh(): Promise<void> {
  if (community.value) community.value = await getCommunity(community.value.slug)
}
// Non-null inside the 'ready' branch (RouterView only renders then). Children inject this.
provide(communityKey, {
  community: community as unknown as Readonly<Ref<CommunityResponse>>,
  refresh,
})

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
  <div v-else-if="state === 'error'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Etwas ist schiefgelaufen</h1>
    <p class="text-sm text-neutral-600">Bitte später erneut versuchen.</p>
  </div>
  <div v-else>
    <header class="mb-4 flex items-center justify-between border-b px-4 py-2">
      <RouterLink to="/" class="font-semibold hover:underline">{{ community?.name }}</RouterLink>
      <div class="flex items-center gap-2">
        <div v-if="community?.viewerIsAdmin" data-test="admin-menu" class="relative">
          <button
            class="rounded border px-2 py-1 text-sm hover:bg-neutral-200"
            @click="adminMenuOpen = !adminMenuOpen"
          >
            ⚙ Verwalten
            <span
              v-if="community.pendingCount > 0"
              class="ml-1 rounded-full bg-blue-600 px-1.5 text-xs text-white"
              >{{ community.pendingCount }}</span
            >
          </button>
          <div
            v-if="adminMenuOpen"
            class="absolute right-0 z-10 mt-1 w-40 rounded border bg-white shadow"
            @click="adminMenuOpen = false"
          >
            <RouterLink
              :to="`/${community.slug}/requests`"
              class="block px-3 py-1.5 text-sm hover:bg-neutral-100"
            >
              Anfragen
              <span v-if="community.pendingCount > 0">({{ community.pendingCount }})</span>
            </RouterLink>
            <RouterLink
              :to="`/${community.slug}/members`"
              class="block px-3 py-1.5 text-sm hover:bg-neutral-100"
              >Mitglieder</RouterLink
            >
            <RouterLink
              :to="`/${community.slug}/settings`"
              class="block px-3 py-1.5 text-sm hover:bg-neutral-100"
              >Einstellungen</RouterLink
            >
          </div>
        </div>
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
