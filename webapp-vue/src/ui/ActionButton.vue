<script setup lang="ts">
import IconSpinner from '~icons/lucide/loader-circle'

// cursor-pointer is explicit: Tailwind v4's preflight resets buttons to cursor:default.
withDefaults(defineProps<{ busy?: boolean; disabled?: boolean; type?: 'button' | 'submit' }>(), {
  busy: false,
  disabled: false,
  type: 'button',
})
</script>

<template>
  <button
    :type="type"
    :disabled="busy || disabled"
    :aria-busy="busy"
    class="inline-flex cursor-pointer items-center justify-center gap-2 rounded border px-3 py-1.5 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-transparent"
  >
    <!--
      An icon-sized slot is reserved on BOTH sides in every state, so the button width never
      changes and the label stays optically centred once the leading slot holds the spinner.
      The label is only greyed out, never hidden: what is running has to stay readable.
    -->
    <span data-test="slot" class="flex size-3.5 shrink-0 items-center justify-center">
      <IconSpinner
        v-if="busy"
        data-test="spinner"
        aria-hidden="true"
        class="size-3.5 motion-safe:animate-spin motion-reduce:animate-[spin_2.4s_linear_infinite]"
      />
    </span>
    <slot />
    <span data-test="slot" class="size-3.5 shrink-0" aria-hidden="true" />
  </button>
</template>
