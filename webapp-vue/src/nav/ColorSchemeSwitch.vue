<script setup lang="ts">
// Light, dark or the system's — a segmented switch in the drawer's foot.
import type { Component } from 'vue'
import IconMoon from '~icons/lucide/moon'
import IconSun from '~icons/lucide/sun'
import IconSunMoon from '~icons/lucide/sun-moon'
import { useColorScheme, type ColorScheme } from '@/ui/colorScheme'

const OPTIONS: { value: ColorScheme; label: string; icon: Component }[] = [
  { value: 'light', label: 'Hell', icon: IconSun },
  { value: 'dark', label: 'Dunkel', icon: IconMoon },
  { value: 'system', label: 'System', icon: IconSunMoon },
]

const scheme = useColorScheme()
</script>

<template>
  <div
    role="group"
    aria-label="Darstellung"
    data-test="color-scheme"
    class="mx-4 my-2 grid grid-cols-3 rounded-lg bg-surface-container p-0.5"
  >
    <button
      v-for="o in OPTIONS"
      :key="o.value"
      type="button"
      :data-test="`color-scheme-${o.value}`"
      :aria-pressed="scheme === o.value"
      class="flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md text-xs"
      :class="
        scheme === o.value
          ? 'bg-surface-container-highest font-medium text-on-surface'
          : 'text-on-surface-variant'
      "
      @click="scheme = o.value"
    >
      <component :is="o.icon" class="size-4" aria-hidden="true" />
      {{ o.label }}
    </button>
  </div>
</template>
