<script setup lang="ts">
/**
 * How often each game comes up, one radio group per game. The four stages are equal-width buttons,
 * a segmented control: one tap per change and the stage reads on the button itself.
 */
import type { GameEntry, GameWeight } from '@/api/types'

const props = defineProps<{ games: GameEntry[]; modelValue: Record<string, GameWeight> }>()
const emit = defineEmits<{ 'update:modelValue': [Record<string, GameWeight>] }>()

const stages: { value: GameWeight; label: string }[] = [
  { value: 'OFF', label: 'aus' },
  { value: 'RARE', label: 'selten' },
  { value: 'NORMAL', label: 'normal' },
  { value: 'OFTEN', label: 'häufig' },
]

function choose(id: string, weight: GameWeight): void {
  emit('update:modelValue', { ...props.modelValue, [id]: weight })
}
</script>

<template>
  <div class="space-y-3">
    <fieldset v-for="game in games" :key="game.id">
      <legend class="mb-1 text-sm">{{ game.displayName }}</legend>
      <div class="grid grid-cols-4 overflow-hidden rounded border">
        <label
          v-for="stage in stages"
          :key="stage.value"
          class="flex h-11 cursor-pointer items-center justify-center border-l text-sm first:border-l-0 hover:bg-surface-container-highest has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2"
        >
          <input
            type="radio"
            class="sr-only"
            :name="`weight-${game.id}`"
            :value="stage.value"
            :checked="modelValue[game.id] === stage.value"
            @change="choose(game.id, stage.value)"
          />{{ stage.label }}
        </label>
      </div>
    </fieldset>
  </div>
</template>
