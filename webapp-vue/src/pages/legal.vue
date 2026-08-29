<script setup lang="ts">
/**
 * Google's terms require that an app embedding Google Maps / Street View binds its own
 * users to Google's terms and points at Google's privacy policy. This is that paragraph —
 * the only content this page carries.
 */
</script>

<template>
  <section class="mx-auto max-w-xl space-y-6 py-8 text-sm">
    <h1 class="text-xl font-semibold">Rechtliches</h1>

    <div class="space-y-2">
      <h2 class="font-semibold">Google Maps &amp; Street View</h2>
      <p>
        Diese Anwendung bindet Google Maps und Google Street View ein, um Karten und
        Straßenansichten anzuzeigen. Wer diese Funktion nutzt, akzeptiert damit die
        <a
          href="https://policies.google.com/terms"
          target="_blank"
          rel="noopener"
          class="text-blue-700 underline"
          >Nutzungsbedingungen von Google</a
        >.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="font-semibold">Datenschutz</h2>
      <p>
        Beim Laden einer Karte oder Straßenansicht werden Anfragen an Google übermittelt. Es gilt
        die
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noopener"
          class="text-blue-700 underline"
          >Datenschutzerklärung von Google</a
        >.
      </p>
      <p>
        Zu einem im Spiel „Weltanschauung“ abgegebenen Tipp speichert countdown die Panorama-ID der
        Street-View-Aufnahme und das daraus ermittelte Land; die Position hinter der Panorama-ID
        wird serverseitig nur zur Bestimmung des Landes aufgelöst und nicht gespeichert.
      </p>
    </div>
  </section>
</template>
