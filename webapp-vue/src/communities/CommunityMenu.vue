<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import IconUsers from '~icons/lucide/users'
import IconPlus from '~icons/lucide/plus'
import HeaderMenu from '@/ui/HeaderMenu.vue'
import type { ActiveCommunity } from '@/communities/context'
import type { CommunitySummary } from '@/api/types'
import { useCommunities } from '@/communities/useCommunities'
import { communityPath } from '@/communities/routes'
import { useAuth } from '@/auth/useAuth'

const props = defineProps<{ community: ActiveCommunity }>()
const router = useRouter()
const { active, refresh } = useCommunities()
const { user } = useAuth()

onMounted(() => {
  // A failed list leaves the admin block and the create action working.
  refresh().catch((e) => console.error('could not load the community list', e))
})

const others = computed(() => active.value.filter((c) => c.slug !== props.community.slug))
const showDot = computed(() => props.community.viewerIsAdmin && props.community.pendingCount > 0)
const label = computed(() => (showDot.value ? 'Community-Menü, offene Anfragen' : 'Community-Menü'))
const mayCreate = computed(() => user.value?.mayCreateCommunities ?? false)
// The create link used to guarantee the panel was never empty. Without it, a non-admin in exactly
// one community would open an empty dropdown — no menu is better than an empty one.
const hasEntries = computed(
  () => props.community.viewerIsAdmin || others.value.length > 0 || mayCreate.value,
)

// Every entry is a flex row so a trailing element can be pushed right with ml-auto. Keep it
// here rather than adding `flex` next to `block` per entry: both are display utilities, and
// which one wins depends on Tailwind's emission order, not on the class attribute.
// cursor-pointer is explicit: Tailwind v4's preflight resets buttons to cursor:default.
const ENTRY =
  'flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-sm hover:bg-neutral-100'

function go(c: CommunitySummary): void {
  router.push(communityPath(c.slug)).catch((e) => console.error('navigation failed', e))
}
</script>

<template>
  <HeaderMenu v-if="hasEntries" :label="label" data-test="community-menu">
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
      <RouterLink :to="communityPath(community.slug, 'requests')" :class="ENTRY">
        Anfragen
        <span
          v-if="community.pendingCount > 0"
          class="ml-auto rounded-full bg-blue-600 px-1.5 text-xs text-white"
          >{{ community.pendingCount }}</span
        >
      </RouterLink>
      <RouterLink :to="communityPath(community.slug, 'members')" :class="ENTRY"
        >Mitglieder</RouterLink
      >
      <RouterLink :to="communityPath(community.slug, 'settings')" :class="ENTRY"
        >Einstellungen</RouterLink
      >
      <div
        v-if="others.length > 0 || mayCreate"
        data-test="admin-divider"
        class="my-1 border-t border-neutral-200"
      />
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
      v-if="mayCreate"
      to="/communities/new"
      data-test="create-community"
      :class="`${ENTRY} gap-2 text-neutral-600`"
    >
      <IconPlus class="size-4" />
      Spielgemeinschaft
    </RouterLink>
  </HeaderMenu>
</template>
