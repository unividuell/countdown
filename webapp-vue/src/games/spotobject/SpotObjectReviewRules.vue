<script setup lang="ts">
/**
 * How the round is judged, and nothing else. Same box, same shape as the game's own rules, and the
 * same voice: the reader is one player with one ballot, not the group.
 *
 * The game master's override is deliberately absent: almost nobody can use it, and explaining an
 * exception next to the rule makes the rule look negotiable.
 */
</script>

<template>
  <ul class="ms-4 list-disc space-y-1">
    <li>Jeder Tipp ist erst einmal gültig — du entscheidest mit, ob ihr ihn glaubt.</li>
    <li>Daumen hoch heißt: der Gegenstand ist da. Daumen runter: ist er nicht.</li>
    <li>Ein zweiter Druck auf denselben Daumen nimmt deine Stimme wieder zurück.</li>
    <li>Ab zwei Daumen runter in der Mehrheit ist der Tipp gestrichen und bringt keine Punkte.</li>
    <li>Deine Stimme steht unter dem Tipp — anonym geht das hier nicht.</li>
  </ul>
</template>
