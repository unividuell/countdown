<script setup lang="ts">
/** How Platzierung is played. Text only — the folding lives in `ui/InfoBox`. */
</script>

<template>
  <ul class="ms-4 list-disc space-y-1">
    <li>
      Das Spielfeld zeigt ein Foto in Graustufen, der Ausschnitt darunter ein Stück davon in Farbe.
    </li>
    <li>
      Tippe ins Spielfeld, um den Rahmen dort abzulegen. Ziehst du, wandert er mit deiner Bewegung —
      dein Finger muss dafür nicht auf ihm liegen.
    </li>
    <li>
      Es zählt nur der exakte Treffer: Liegt der Rahmen auch nur ein Feld daneben, ist es keiner.
    </li>
    <li>Abgegeben wird, indem du den Knopf (unter dem Ausschnitt) gedrückt hältst.</li>
  </ul>
</template>
