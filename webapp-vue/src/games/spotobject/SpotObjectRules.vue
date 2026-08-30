<script setup lang="ts">
/**
 * How the game is played, and nothing else. Text only — the folding lives in `ui/InfoBox`.
 *
 * The review is deliberately absent: while somebody is still searching, the ballot is not their
 * problem yet, and it has its own box on the reveal where it is.
 */
</script>

<template>
  <ul class="ms-4 list-disc space-y-1">
    <li>
      Zieh das Männchen vom rechten Rand irgendwo auf die Weltkarte — oder ziel mit dem Fadenkreuz
      auf eine blaue Linie und drück drauf. Beides bringt dich an dieselbe Stelle.
    </li>
    <li>Hast du den gesuchten Gegenstand vor dir, drück auf „Gefunden“.</li>
    <li>
      Abgegeben wird genau der Blick, den du gerade siehst — dreh dich also erst richtig hin. Stell
      den Gegenstand dabei am Besten ins Fadenkreuz.
    </li>
    <li>Dein eigenes Land zählt nicht. Such woanders.</li>
  </ul>
</template>
