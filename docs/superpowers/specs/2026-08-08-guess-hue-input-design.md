# Guess Hue — die Eingabeseite

**Status:** beschlossenes Design (2026-08-08).

**Baut auf:** [Datenset-Spec](2026-08-07-guess-hue-dataset-design.md) (Runde, Ziehung, was zum
Client darf) und [Game-Lab-Spec](2026-08-08-game-lab-design.md) (die Testumgebung).

**Portiert aus:** `huettehuette.unividuell.org`,
`components/games/guessColor/GuessColorGame.vue`. Übernommen wird die **Idee**, nicht der Code.

## Scope

Gebaut wird die Eingabe: ein Text malt eine Farbe aus, der Spieler dreht ein Rad, hält den
Mittelknopf und gibt damit einen Winkel ab. Spielbar im Game-Lab, gegen einen Seed aus der URL.

**Nicht gebaut wird die Wertung.** Kein Punktestand, keine Toleranzprüfung, keine echte
Spielseite außerhalb des Labs. Der Guess wird angenommen, validiert und gespeichert — mehr nicht.
Was nach der Abgabe zu sehen ist, ist ausdrücklich vorläufiges Lab-Gerüst
(siehe *Der „Tipp steht"-Zustand*) und nicht die spätere Bestätigungsansicht.

Der Schnitt ist bewusst so gelegt, dass er nichts vorwegnimmt, was der Spielrahmen später anders
entscheiden könnte: Rundenpersistenz, Phasenlogik und die Umstellung der Wertung in Phase 2 sind
Entscheidungen, die dieser Spec nicht berührt.

## Backend

### Kein neues Modul

`guesshue` besitzt mit `GuessHueDataset.draw(SeededRandom)` bereits die vollständige Ziehung. Der
Lab-Adapter `GuessHueLabGame` liegt in `gamelab.internal` und ruft die öffentliche API des
Spielmoduls auf.

Das ist die Richtung, die [game-lab.md](../../../.claude/guidelines/game-lab.md) vorschreibt:
`guesshue` weiß nichts vom Lab und bleibt unverändert; das Lab ließe sich löschen, ohne das Spiel
anzufassen.

### Das Payload

```kotlin
data class GuessHuePayload(
    val description: String,
    val initHue: Double,      // [0, 360)
    val saturation: Double,   // 0.50 … 0.78
    val lightness: Double,    // 0.38 … 0.52
) : LabPayload
```

Der Datenset-Spec nennt unter *Was der Client bekommt* dieselben Werte, aber „als Hex". **Davon
weichen wir ab und schicken Zahlen.** Hex hieße Umrechnen auf beiden Seiten; CSS `hsl()` nimmt die
drei Werte direkt, und der Winkel muss ohnehin als Zahl übertragen werden, sonst kann das Rad nicht
darauf zeigen. Die Hex-Formulierung war eine Folge der `chroma-js`-Abhängigkeit im Original, keine
fachliche Festlegung.

`GuessHueTarget.hue` — die Lösung — verlässt den Server nicht, auch nicht abgeleitet.

**Festgenagelt wird das durch den Feldmengen-Test**, wie ihn `game-lab.md` für jedes `LabPayload`
verlangt:

```kotlin
mapper.readTree(json).propertyNames().toSet() shouldBe
    setOf("description", "initHue", "saturation", "lightness")
```

Die Feldmenge zu pinnen statt die Abwesenheit der Lösung zu prüfen ist der Punkt: es fängt auch ein
Feld, das die Lösung nur *einengt*.

### Drei Änderungen am Lab-Vertrag

Das Lab passt sich an, nicht das Spiel — auch das ist Vorgabe, nicht Ermessen.

**1. `LabGame.score` gibt `LabOutcome?` zurück.** Guess Hue validiert den Guess und wertet ihn
nicht; `null` heißt „angenommen, nicht gewertet". `LabService.guess` ruft `score()` weiterhin
*vor* dem Speichern, ein ungültiger Guess verbraucht also weiterhin keinen Versuch. Nullable wird
durchgereicht bis `LabEntry.outcome` und `LabEntryDto.outcome`; das Frontend hat dort schon
`unknown`.

`SampleLabGame` bleibt unverändert: sein `SampleOutcome` ist ein Subtyp, Kotlin erlaubt die
Verengung des Rückgabetyps beim Override.

**2. `LabGame` bekommt `val revealsOthersBeforeGuess: Boolean` — ohne Default.** `game-lab.md`
verlangt für jedes echte Spiel eine bewusste Entscheidung darüber und warnt ausdrücklich davor, sie
vom Sample zu erben. Ein Default wäre genau diese Einladung. `SampleLabGame` bekommt eine Zeile
`= true` und behält sein dokumentiertes Verhalten.

**3. `LabEntries.vue` lässt den `→ null`-Teil weg**, wenn kein Outcome vorliegt.

### `others` bleibt verborgen, bis geraten wurde

Guess Hue setzt `revealsOthersBeforeGuess = false`.

Ohne Wertung ist der Winkel eines anderen Testers das **einzige** Signal in der Runde — und ein
starkes: da hat jemand denselben Text gelesen und das Rad gedreht. Wer noch nicht geraten hat,
bekäme die Antwort geschenkt. Nach dem eigenen Guess erscheinen alle Einträge; dann ist es
Vergleichen statt Abschreiben.

`me` ist davon nicht betroffen — den eigenen Eintrag sieht man immer.

### Guess-Format und Validierung

`{ "hue": <number> }`, `hue` in `[0, 360)`. Vier Ablehnungsgründe, alle als
`InvalidGuessException`: Feld fehlt, keine Zahl, `< 0`, `>= 360`.

Der Client schickt einen **gerundeten Ganzzahl-Winkel**. Die Serverprüfung bleibt trotzdem auf
„Zahl in `[0, 360)`" und nicht auf „Ganzzahl" — der Guess ist ein Winkel, keine Aufzählung, und
eine spätere Eingabeart mit feinerer Auflösung soll nicht an der Validierung scheitern. Das Runden
ist Anzeigehygiene: es macht das rohe JSON in der Lab-Liste lesbar.

### Betrieb

Ohne gesetztes `GUESS_HUE_DATASET_PATH` läuft die lokale Instanz auf dem gebündelten Sample-Set und
warnt beim Start. Das Lab funktioniert damit vollständig — die **60 echten Beschreibungen** lassen
sich aber erst beurteilen, wenn das entschlüsselte Datenset aus `.local/` eingebunden ist. Der Weg
dahin steht in [game-content.md](../../../.claude/guidelines/game-content.md).

## Frontend

### Bausteine

| Datei | Aufgabe | Weiß nichts von |
| --- | --- | --- |
| `games/guesshue/geometry.ts` | `angleFromPoint`, `wrap360`, `hueName` — reine Funktionen | Vue |
| `games/guesshue/HueWheel.vue` | das Rad: zeigen, ziehen, Tastatur, ARIA | Spiel, Lab |
| `ui/useHoldProgress.ts` | die Halte-Mechanik: Fortschritt, Abbruch, Abschluss | DOM-Semantik |
| `ui/HoldButton.vue` | der Knopf mit Fortschrittsring | Farbe |
| `games/guesshue/GuessHueBoard.vue` | der Screen: Zitat, Rad, Hinweis, Tipp-steht | Lab |
| `gamelab/GuessHueLabGame.vue` | Adapter: Payload → Board, Winkel → `{ hue }` | — |

Der Schnitt zwischen Board und Lab-Adapter ist der, der später zählt: die echte Spielseite bindet
dasselbe Board an ihre eigene API, ohne dass eine Zeile Rad- oder Halte-Logik mitwandert.

`HoldButton` liegt in `ui/`, weil die Bestätigungsgeste nichts mit Farbe zu tun hat und das nächste
Spiel sie wiederverwenden wird.

### Das Rad

Drei Schichten: ein statischer Farbring, eine Drehschicht mit dem Knopf, und in der Mitte ein Slot
für den Bestätigungsknopf.

**Der Ring ist eine Zeile CSS:**

```css
background: conic-gradient(hsl(0 …), hsl(30 …), …, hsl(360 …));           /* Fallback, 13 Stops */
background: conic-gradient(in hsl longer hue, hsl(0 var(--s) var(--l)), hsl(360 var(--s) var(--l)));
```

Das ist der exakte Verlauf statt der neun 45°-Stops des Originals, die sichtbar bänderten. Wo die
Interpolations-Syntax fehlt, verwirft der Browser die spätere Deklaration und der Fallback trägt.

Hue 0 liegt oben, Winkel wachsen im Uhrzeigersinn — die Richtung, in die `conic-gradient` ohnehin
läuft. Damit braucht die Drehung keinen Versatz.

**Gegriffen wird überall auf dem Ring**, nicht nur am Knopf; der Winkel springt sofort unter den
Finger. Das ist der Grund, warum sich das Original auf dem Handy gut anfühlt, und es wird
übernommen. Technisch aber anders: `pointerdown` + `setPointerCapture` + `touch-action: none`,
statt vier Listener-Paaren auf `document` und einem `preventDefault` in einem non-passive
`touchmove`. `will-change: transform` steht nur während des Ziehens.

**Die Mitte ist doppelt geschützt.** Der Mittelknopf liegt als echter `<button>` obenauf und fängt
Berührungen dort selbst; zusätzlich hält ein laufender Zug den letzten Winkel, sobald der Finger
unter den Totzonen-Radius wandert. Ohne das macht `atan2` aus einem Millimeter Fingerbewegung in
der Radmitte einen 90°-Sprung.

Die Totzone ist **derselbe Radius wie der Mittelknopf** — 30 % des Raddurchmessers, bei `max-w-80`
also 96 px und damit weit über der 44-px-Untergrenze für Tippziele. Ein Wert, zwei Zwecke: was der
Knopf einfängt, ignoriert das Rad ohnehin.

### Tastatur und ARIA

Der Rad-Container ist **ein** `role="slider"` mit `aria-valuemin=0`, `aria-valuemax=359`,
`aria-valuenow`, `aria-roledescription="Farbrad"` und einem `aria-valuetext`, das den Farbnamen
nennt statt der Gradzahl („Blau, 240 Grad"). Ring und Knopf sind `aria-hidden` — die
Namensgebung sitzt auf dem umschließenden Steuerelement, wie in
[frontend-ui.md](../../../.claude/guidelines/frontend-ui.md) beschrieben.

Tasten: Pfeile ±1°, PageUp/PageDown ±10°, Home/End. `aria-valuenow` trägt den **gerundeten**
Winkel — Ziehen erzeugt Nachkommastellen, die vorzulesen niemandem hilft.

Der Farbname kommt aus einer Tabelle mit zwölf Namen im 30°-Raster, Index `round(h / 30) % 12`:
Rot, Orange, Gelb, Gelbgrün, Grün, Blaugrün, Türkis, Azurblau, Blau, Violett, Magenta, Pink.

Er ist Screenreader-Parität, kein Hinweis: wer die Farbe sieht, liest dieselbe Information aus dem
Mittelknopf ab. Deshalb bleibt das Raster auch grob — ein feineres Vokabular gäbe dem
Screenreader-Nutzer mehr, als das Bild hergibt.

### Bestätigen ist eine Geste, kein Tastendruck

**Auf der Tastatur gilt dieselbe Geste, nicht eine zweite.** `keydown` auf Leertaste oder Enter
startet denselben Halte-Vorgang wie `pointerdown`, `keyup` bricht ihn ab, Wiederholungen
(`event.repeat`) werden ignoriert, und das voreingestellte Klick-Verhalten des Buttons wird
unterdrückt.

Der Gewinn: ein synthetischer Klick **ohne** echtes Halten — Sprachsteuerung, ein AT-Werkzeug, ein
versehentliches Enter — löst nichts aus. Die Geste fällt zu, nicht auf. Das ist der Grund, warum
hier kein „Enter bestätigt sofort" steht: eine unwiderrufliche Abgabe darf nicht einen Tastendruck
kosten.

**Bewusste Lücke:** wer gar keine Taste 1200 ms halten kann, kann damit nicht bestätigen. Das ließe
sich nur mit einer Einstellung „Bestätigen ohne Halten" auflösen, und die gehört nicht in diesen
Schnitt. Die Lücke steht hier, statt weggeschrieben zu werden.

### Bewegung

Drei Animationen, alle unter `prefers-reduced-motion` **und** `document.hidden` übersprungen —
`frontend-state.md` verlangt beides, seit eine im Hintergrund-Tab angelegte Animation in Gecko nie
zu Ende läuft und nie freigegeben wird. Übersprungen heißt: der Endzustand wird direkt gezeichnet.

**1. Der Einflug mit Schweif.** Der Knopf startet auf seiner Init-Position und läuft **genau eine
volle Runde** (~800 ms, Ease-out in die Endlage, die dieselbe ist wie die Startlage). Hinter ihm
öffnet sich der Farbring als Maske, die ihm um ~70 ms *nachläuft* — dieser Abstand macht aus dem
Knopf einen Kometenkopf und aus dem Ring seine Schweifspur.

Eine rAF-Schleife, zwei CSS-Variablen (`--knob-deg`, `--paint-deg`); die Maske ist ein
`conic-gradient(from <startwinkel>, …)`, damit sich der Ring dort zu öffnen beginnt, wo der Knopf
steht. Weil Start- und Endwinkel pro Runde verschieden sind, wandert diese Stelle mit.

Zwei gekoppelte Werte mit fester Verzögerung sind in einer Schleife billiger und lesbarer als zwei
synchronisierte `Element.animate()`-Aufrufe. Wer das Rad währenddessen anfasst, bekommt es sofort
fertig gezeichnet und den Knopf unter den Finger.

**2. Der Halte-Ring.** `--hold` läuft in einer rAF-Schleife von 0 auf 1; Loslassen vor dem Ende
lässt ihn sichtbar zurücklaufen. Kein CSS-Übergang, weil Rücklauf und Abschluss-Callback ohnehin
selbst geführt werden.

Der Ring **bleibt unter `prefers-reduced-motion`** — Fortschritt ist Information, keine Zierde; nur
der Rücklauf wird dort sofort.

Er bleibt aber **nicht** über einen Tab-Wechsel hinweg: `visibilitychange` nach `hidden` **bricht
das Halten ab**. Sonst friert die Schleife mitten im Halten ein und läuft beim Zurückkommen aus
einem veralteten Startzeitpunkt zu Ende — ein Tipp, der abgeschickt wird, während niemand hinsah,
ist genau das, was die Tastatur-Entscheidung oben ausschließt.

**3. Der Einrast-Puls.** ~200 ms auf dem Mittelknopf nach dem Abschluss, dann steht das Rad.

**Die Haltedauer ist eine Konstante an einer Stelle:** `HOLD_MS = 1200`. Das Original hielt 2000 ms;
beim Wiederholen fühlt sich das lang an. Der Wert gehört im Lab hingedreht — genau dafür ist es da.

### Der Screen

Eine Card (`rounded-xl border border-neutral-200 bg-white`, wie `MessageCard`), darin von oben:

1. **Die Beschreibung** als Zitat: Randlinie links statt Kasten, `text-xl`, `leading-relaxed`,
   `font-medium`, kursiv, deutsche Anführungszeichen — und `select-none`, damit ein Daumen neben
   dem Rad keine Textauswahl und kein iOS-Kontextmenü auslöst. Die `dark:`-Klassen des Originals
   werden **nicht** übernommen: in `webapp-vue` gibt es bislang keine einzige, und ein
   Dark-Mode-Fragment in genau einer Komponente wäre die erste Hälfte einer Entscheidung, die
   niemand getroffen hat.
2. **Das Rad**, `w-full aspect-square max-w-80` in einem `w-full`-Wrapper. Auf einem 375er-Display
   bleiben nach `main`- und Card-Padding rund 310 px, also praktisch die volle Breite. Der
   `w-full`-Wrapper ist nicht kosmetisch: in einer `items-center`-Spalte löst sich eine
   Prozentbreite sonst gegen die eigene Inhaltsbreite auf (siehe `frontend-ui.md`).
3. **Eine Zeile**, immer sichtbar: „Du stellst nur den Farbton ein — Sättigung und Helligkeit sind
   vorgegeben. Eine kleine Abweichung ist erlaubt."

Kein Aufklapp-Kasten. Auf dem Handy ist vertikaler Platz das knappste Gut, und ein Kasten, den
niemand aufklappt, hat keinen Leser. Die HSL-Lehrstunde des Originals entfällt ersatzlos: der
Spieler sieht Sättigung und Helligkeit, er stellt sie nicht ein, und die Namen der Achsen ändern an
seiner Entscheidung nichts.

Kein Kasten im Kasten: die Beschreibung bringt eine Randlinie mit, keinen eigenen Rahmen.

### Der „Tipp steht"-Zustand — vorläufig

Nach dem Bestätigen: das Rad rastet ein, der abgegebene Winkel steht als Zahl da, ein knapper Satz
dazu.

**Das ist Lab-Gerüst mit Verfallsdatum, nicht die Bestätigungsansicht.** Es steht hier, weil sich im
Lab sonst nicht arbeiten lässt — man muss den eigenen Winkel mit denen der anderen vergleichen
können. Die echte Ansicht nach der Abgabe ist ein eigenes Thema und wird diesen Zustand ersetzen.
Wer ihn später anfasst: er darf ohne Ersatz verschwinden.

Der Lab-Adapter füttert `me.guess.hue ?? payload.initHue` als Startwinkel. Ohne das stünde das Rad
nach einem Reload auf `initHue` statt auf dem abgegebenen Tipp — der Zustand würde lügen. `me.guess`
steht ohnehin in der Antwort.

Gesperrt wird über das `disabled`, das die Lab-Seite bereits setzt, sobald `me != null`.

## Tests

**Backend.** Feldmenge des Payloads gepinnt; Determinismus je Seed; die vier Ablehnungsfälle;
`score` gibt `null`; `revealsOthersBeforeGuess` ist `false`. In `LabServiceTest` der Nachweis, dass
`others` leer bleibt, solange `me` null ist, und gefüllt, sobald nicht.

**Frontend.**

- `geometry.spec.ts` — die reinen Funktionen gegen synthetische Rechtecke in allen vier Quadranten,
  dazu die Achsenpunkte und die Namenstabelle an ihren Grenzen.
- `useHoldProgress.spec.ts` — mit falschen Timern (inklusive `requestAnimationFrame`): Abschluss
  nach der Dauer, Abbruch davor, Rücklauf, Abbruch bei `visibilitychange`.
- Komponententests nur strukturell: ARIA-Attribute, Tastatur-Emits, gesperrter Zustand, dass das
  Board die Beschreibung rendert und beim Abschluss `guess` mit dem Winkel emittiert.

### Was happy-dom nicht kann

**Die Zeigergeometrie ist deshalb in `geometry.ts` ausgelagert.** happy-dom rechnet kein Layout;
`getBoundingClientRect()` liefert Nullen, Zeigermathe ist im Komponententest schlicht nicht
prüfbar. Der Test prüft die reine Funktion gegen ein gestelltes Rechteck, die Komponente nur die
Verdrahtung.

Das ist eine Grenze, kein Versäumnis. Wer hier später „fehlende Tests" sieht: die Zahlen sind eine
Browser-Messung und gehören in die manuelle Verifikation.

**Manuell verifiziert wird** im Browser gegen `/c/{slug}/lab/guess-hue?seed=…`, schmal und breit,
inklusive Einflug, Halten mit Abbruch, Tastaturbedienung und Tab-Wechsel während des Haltens.

## Bewusst nicht übernommen

- **`@radial-color-picker` und `chroma-js`.** Die Library brachte im Original DOM-Griffe
  (`getElementsByClassName("rcp__well")`) und CSS-Overrides ihrer Interna mit sich; `chroma-js`
  rechnete, was CSS heute nativ kann. Übernommen wurden ihre **Ideen** — ein `role="slider"` für
  das ganze Rad, die Tastenbelegung, die rotierende Schicht mit dem Knopf als Kind, das Greifen
  überall auf dem Rad. Der Code nicht.
- **Der 1.8×-Skalier-Effekt beim Halten.** Er zeigt Reaktion, aber nicht Fortschritt. Der Ring
  zeigt beides.
- **Die HSL-Erklärung** und der zweite Aufklapp-Kasten (siehe *Der Screen*).
