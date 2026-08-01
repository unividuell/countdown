<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import IconUsers from '~icons/lucide/users'
import IconPlus from '~icons/lucide/plus'
import HeaderMenu from '@/ui/HeaderMenu.vue'
import type { ActiveCommunity } from '@/communities/context'
import type { CommunitySummary } from '@/api/types'
import { useCommunities } from '@/communities/useCommunities'
import { setSelection } from '@/api/communities'

const props = defineProps<{ community: ActiveCommunity }>()
const router = useRouter()
const { active, refresh } = useCommunities()

onMounted(() => {
  // A failed list leaves the admin block and the create action working.
  refresh().catch((e) => console.error('could not load the community list', e))
})

const others = computed(() => active.value.filter((c) => c.slug !== props.community.slug))
const showDot = computed(() => props.community.viewerIsAdmin && props.community.pendingCount > 0)
const label = computed(() => (showDot.value ? 'Community-Menü, offene Anfragen' : 'Community-Menü'))

const ENTRY = 'block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100'

async function go(c: CommunitySummary): Promise<void> {
  // The selection is only a "last visited" marker — losing it must not block the navigation.
  try {
    await setSelection(c.id)
  } catch (e) {
    console.error('could not persist the community selection', e)
  }
  router.push(`/${c.slug}/`).catch((e) => console.error('navigation failed', e))
}
</script>

<template>
  <HeaderMenu :label="label" data-test="community-menu">
    <template #trigger>
      <span class="relative flex">
        <IconUsers class="size-5" />
        <span
          v-if="showDot"
          data-test="pending-dot"
          aria-hidden="true"
          class="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-stone-900 bg-blue-600"
        />
      </span>
    </template>

    <template v-if="community.viewerIsAdmin">
      <div class="px-3 pt-1 pb-0.5 text-xs text-neutral-500">{{ community.name }}</div>
      <RouterLink :to="`/${community.slug}/requests`" :class="ENTRY">
        Anfragen
        <span v-if="community.pendingCount > 0">({{ community.pendingCount }})</span>
      </RouterLink>
      <RouterLink :to="`/${community.slug}/members`" :class="ENTRY">Mitglieder</RouterLink>
      <RouterLink :to="`/${community.slug}/settings`" :class="ENTRY">Einstellungen</RouterLink>
      <div class="my-1 border-t border-neutral-200" />
    </template>

    <button
      v-for="c in others"
      :key="c.id"
      type="button"
      data-test="switch-community"
      :class="ENTRY"
      @click="go(c)"
    >
      {{ c.name }}
    </button>

    <RouterLink
      to="/communities/new"
      data-test="create-community"
      :class="`${ENTRY} flex items-center gap-2 text-neutral-600`"
    >
      <IconPlus class="size-4" />
      Spielgemeinschaft erstellen
    </RouterLink>
  </HeaderMenu>
</template>
