<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useCommunities } from '@/communities/useCommunities'
import { communityPath } from '@/communities/routes'
import { useAuth } from '@/auth/useAuth'

const { active, refresh } = useCommunities()
const { user } = useAuth()

onMounted(refresh)
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Deine Spielgemeinschaften</h1>
    <ul v-if="active.length" class="mb-6 space-y-2">
      <li v-for="c in active" :key="c.id">
        <RouterLink :to="communityPath(c.slug)" class="text-blue-700 hover:underline">{{
          c.name
        }}</RouterLink>
      </li>
    </ul>
    <!--
      Two empty states, because the copy must not point at an entry point the viewer does not
      have. Without the clearance there is no hint that creating exists at all.
    -->
    <p v-else-if="user?.mayCreateCommunities" class="mb-6 text-sm text-neutral-600">
      Du bist noch in keiner Spielgemeinschaft. Erstelle eine — oder öffne einen Einladungslink, den
      du erhalten hast.
    </p>
    <p v-else class="mb-6 text-sm text-neutral-600">
      Du bist noch in keiner Spielgemeinschaft. Öffne einen Einladungslink, den du erhalten hast.
    </p>
    <RouterLink
      v-if="user?.mayCreateCommunities"
      to="/communities/new"
      class="rounded border px-3 py-1.5 hover:bg-neutral-200"
      >Spielgemeinschaft erstellen</RouterLink
    >
  </section>
</template>
