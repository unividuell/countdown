<script setup lang="ts">
/**
 * How Peilung is played, in the singular or plural of the round's clips. Text only — the folding
 * lives in `ui/InfoBox`.
 */
const props = defineProps<{ clips: number }>()
</script>

<template>
  <ul class="ms-4 list-disc space-y-1">
    <li>
      Ein Ping schickt eine Welle los. Was sie erreicht, erklingt in dem Moment, in dem sie dort
      ankommt.
    </li>
    <li>
      Eine Welle reicht nicht übers ganze Feld: Was zu weit weg liegt, hörst du bei diesem Ping
      nicht.
    </li>
    <li v-if="props.clips === 1">
      Hörst du den Spruch, tipp aufs Feld: dort bleibt ein Ring stehen. Dieser Ring ist eine reine
      Markierung für dich – er fließt nicht in die Bewertung ein.
    </li>
    <li v-else>
      Hörst du einen Spruch, tipp aufs Feld: dort bleibt ein Ring stehen, bis zu zwei pro Welle.
      Diese Ringe sind eine reine Markierung für dich – sie fließen nicht in die Bewertung ein.
    </li>
    <li v-if="props.clips === 1">
      Drei Pings, ein Pin für den Spruch. Zum Abgeben „Abgeben“ gedrückt halten.
    </li>
    <li v-else>Drei Pings, ein Pin pro Spruch. Zum Abgeben „Abgeben“ gedrückt halten.</li>
  </ul>
</template>
