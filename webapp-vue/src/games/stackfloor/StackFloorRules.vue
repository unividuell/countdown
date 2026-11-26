<script setup lang="ts">
/** How Hochstapler is played. Text only — the folding lives in `ui/InfoBox`. */
defineProps<{ phaseOne: boolean }>()
</script>

<template>
  <ul class="ms-4 list-disc space-y-1">
    <li>Tippen hält den Balken an.</li>
    <li>Was über den Balken darunter hinausragt, wird abgeschnitten.</li>
    <li>Ohne Kontakt zum Balken darunter ist dein Turm fertig.</li>
    <li>Du hast genau einen Versuch.</li>
    <li v-if="phaseOne">Ein Balken sieht anders aus. Erreichst du ihn, hast du den Punkt.</li>
  </ul>
</template>
