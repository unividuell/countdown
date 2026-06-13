<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunities } from '@/communities/useCommunities'
import { setSelection } from '@/api/communities'

defineProps<{ currentSlug: string }>()
const router = useRouter()
const { active, refresh } = useCommunities()
onMounted(refresh)

async function go(slug: string, id: string): Promise<void> {
  await setSelection(id)
  router.push(`/${slug}/`)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <select
      class="rounded border px-2 py-1 text-sm"
      :value="currentSlug"
      @change="
        (e) => {
          const c = active.find((x) => x.slug === (e.target as HTMLSelectElement).value)
          if (c) go(c.slug, c.id)
        }
      "
    >
      <option v-for="c in active" :key="c.id" :value="c.slug">{{ c.name }}</option>
    </select>
    <button
      class="rounded border px-2 py-1 text-sm hover:bg-neutral-200"
      @click="router.push('/communities/new')"
    >
      ＋
    </button>
  </div>
</template>
