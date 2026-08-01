<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue'
import { onKeyStroke, useEventListener } from '@vueuse/core'
import { useRoute } from 'vue-router'

withDefaults(defineProps<{ label: string; align?: 'left' | 'right' }>(), { align: 'left' })

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const route = useRoute()

// onClickOutside is not used here: happy-dom's event shim does not satisfy it
// in tests, so this listens directly and checks containment itself.
useEventListener(document, 'click', (e: Event) => {
  if (open.value && !root.value?.contains(e.target as Node)) open.value = false
})
onKeyStroke('Escape', () => {
  if (!open.value) return
  open.value = false
  trigger.value?.focus()
})
// Every navigating entry closes the menu this way, which is why clicks inside
// the panel are not wired to close: a failed logout has to keep it open.
watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      class="flex items-center rounded p-1 hover:bg-stone-800"
      @click="open = !open"
    >
      <slot name="trigger" />
    </button>
    <div
      v-if="open"
      data-test="menu-panel"
      class="absolute z-20 mt-1 w-56 rounded border bg-white py-1 text-neutral-900 shadow"
      :class="align === 'right' ? 'right-0' : 'left-0'"
    >
      <slot />
    </div>
  </div>
</template>
