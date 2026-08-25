<script setup lang="ts">
/**
 * The original's `GameDescription` content, ported word for word because it is good: the reading
 * rule, then how a tip is given. Text only — the folding lives in `ui/InfoBox`.
 */
</script>

<template>
  <ul class="ms-4 list-disc space-y-1">
    <li>Lies das Spielfeld wie ein Buch — von links nach rechts, Zeile für Zeile.</li>
    <li>Das gesuchte Muster kann nur in Leserichtung gefunden werden.</li>
    <li>Das gesuchte Muster kann über eine Zeile hinweg brechen.</li>
    <li>Das gesuchte Muster kann mehrfach auftauchen — es ist egal, welches du davon findest.</li>
  </ul>
  <p class="mt-3 font-medium">Tippabgabe:</p>
  <ol class="ms-4 list-decimal space-y-1">
    <li>
      Tippe an einer beliebigen Stelle einen Block an, der deiner Meinung nach zum gesuchten Muster
      gehört.
    </li>
    <li>Von dort aus kannst du direkte Nachbarn antippen — vorwärts wie rückwärts.</li>
    <li>Sobald du so viele Blöcke ausgewählt hast wie gesucht, wird dein Tipp abgegeben.</li>
    <li>
      Du fängst neu an, indem du einen Block antippst, der schon ausgewählt ist oder der keinen
      deiner ausgewählten berührt.
    </li>
  </ol>
</template>
