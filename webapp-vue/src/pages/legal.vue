<script setup lang="ts">
/**
 * Google's terms require that an app embedding Google Maps / Street View binds its own
 * users to Google's terms and points at Google's privacy policy. That is the first paragraph;
 * the rest is the credit the sounds of Blockierung ask for.
 *
 * Public, like `/login`: terms one has to sign in to read bind nobody.
 */
definePage({ meta: { public: true } })
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

    <div class="space-y-2">
      <h2 class="font-semibold">Klänge in Blockierung</h2>
      <p>
        Die Klänge beim Setzen und Abbauen stammen aus Minecraft; Mojang hat sie aus freien
        Aufnahmen von Freesound bearbeitet. Wir haben sie ins AAC-Format umgewandelt.
      </p>
      <ul class="ms-4 list-disc space-y-1">
        <li>
          Stein: „Step“ (<a
            href="https://freesound.org/s/32639/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >32639</a
          >,
          <a
            href="https://freesound.org/s/32640/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >32640</a
          >,
          <a
            href="https://freesound.org/s/32643/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >32643</a
          >,
          <a
            href="https://freesound.org/s/32636/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >32636</a
          >,
          <a
            href="https://freesound.org/s/32637/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >32637</a
          >) von carrigsound —
          <a
            href="https://creativecommons.org/publicdomain/zero/1.0/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >CC0 1.0</a
          >
        </li>
        <li>
          Gras: „grass1–4“ (<a
            href="https://freesound.org/s/9904/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >9904</a
          >,
          <a
            href="https://freesound.org/s/9905/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >9905</a
          >,
          <a
            href="https://freesound.org/s/9906/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >9906</a
          >,
          <a
            href="https://freesound.org/s/9907/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >9907</a
          >) von Snoman —
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >CC BY 4.0</a
          >
        </li>
        <li>
          Kies: „<a
            href="https://freesound.org/s/15562/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >gravel walking</a
          >“ von tigersound —
          <a
            href="https://creativecommons.org/licenses/by-nc/4.0/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >CC BY-NC 4.0</a
          >
        </li>
        <li>
          Glas: „<a
            href="https://freesound.org/s/41348/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >glass shatter</a
          >“ von datasoundsample —
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >CC BY 4.0</a
          >; „<a
            href="https://freesound.org/s/88808/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >gb12</a
          >“ von lsprice —
          <a
            href="https://creativecommons.org/licenses/by/3.0/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >CC BY 3.0</a
          >; „<a
            href="https://freesound.org/s/71947/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >bm_Glass_Break</a
          >“ von cmusounddesign —
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener"
            class="text-blue-700 underline"
            >CC BY 4.0</a
          >
        </li>
      </ul>
    </div>
  </section>
</template>
