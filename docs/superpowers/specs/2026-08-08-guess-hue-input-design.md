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
Was nach der Abgabe zu sehen ist, ist die Einträge-Liste des Labs (siehe *Nach der Abgabe: eine
Liste, kein zweiter Zustand*), nicht die spätere Bestätigungsansicht.

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

**Der Client schickt den exakten Winkel, nicht gerundet.** Ein Winkel ist keine Aufzählung; was
der Spieler eingestellt hat, ist eine Kommazahl, und zu runden hieße, seine Eingabe zu verändern,
bevor sie irgendjemand bewertet hat. Gerundet wird ausschließlich, was Menschen lesen —
`aria-valuenow` und die Zahl in der Tipp-Karte.

Die Serverprüfung lautet entsprechend „Zahl in `[0, 360)`" und nicht „Ganzzahl".

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
| `games/guesshue/GuessHueBoard.vue` | die Spielkarte: Zitat, Rad, Hinweiszeile | Lab, „mein Tipp" |
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

**Nur das Band startet einen Zug.** Das Rad ist ein schmaler Regenbogen-Ring, keine gefüllte
Scheibe: `pointerdown` gattert auf `radiusFraction`, und nur zwischen `BAND_INNER_FRACTION` (0,78)
und dem äußeren Rand (1,0) beginnt ein Zug. Innen — dort, wo ohnehin der Mittelknopf liegt —
passiert nichts; der Knopf fängt seine Berührungen als echter `<button>` selbst ab.

**Einmal gegriffen, folgt der Knopf überallhin.** Die Bandgrenze gilt nur fürs *Starten*; ein
laufender Zug folgt dem Finger danach auch außerhalb des Bands und sogar außerhalb des Quadrats,
das das Rad umschreibt — ein Daumen, der beim Drehen nach innen oder außen abdriftet, darf den Zug
nicht verlieren. Die einzige Ausnahme ist ein kleiner Stabilitäts-Wächter um die Mitte
(`CENTRE_HOLD_FRACTION`, 8 % des Radius): darunter hält der Winkel seinen letzten Wert, statt aus
einem Millimeter Fingerbewegung den 90°-Sprung zu machen, den `atan2` in Zentrumsnähe sonst
liefert. Anders als eine Totzone verhindert dieser Wächter weder einen Start noch einen laufenden
Zug — er hält nur den Wert fest, solange der Finger zu nah an der Mitte ist.

**Gesperrt zeigt sich auch am Band selbst:** sobald `disabled` steht, malt sich das Band in
Graustufen. Knopf und Bestätigungsknopf behalten ihre Farbe — der Knopf ist die Farbvorschau und
nach der Runde das einzige noch lesenswerte Element —, weshalb der Filter nur auf dem Ring sitzt.

*(Diese Passage ersetzt eine frühere Fassung: „Totzone = 30 % = Mittelknopfradius, ein Wert, zwei
Zwecke". Das war eine Rasierklinge, keine Entscheidung. Solange beide Radien exakt zusammenfielen,
verdeckte der eine eine Lücke im anderen: ein Druck auf den Bestätigungsknopf durchläuft auf dem
Weg nach oben auch das `pointerdown` des Rads, und ohne ein eigenes `.stop` an der Mitten-Slot-
Hülle hätte das Rad ihn als Griff gelesen — was der zufällig deckungsgleiche Radius nie zeigte.
Getrennte, unabhängig gewählte Werte — der Band-Innenradius fürs Starten, der viel kleinere
Stabilitäts-Radius fürs Halten während eines laufenden Zugs — und ein explizites `.stop` an der
Mitte schließen das aus, ohne sich auf eine Koinzidenz zu verlassen.)*

### Tastatur und ARIA

Der Rad-Container ist **ein** `role="slider"` mit `aria-valuemin=0`, `aria-valuemax=359`,
`aria-valuenow`, `aria-roledescription="Farbrad"` und einem `aria-valuetext`, das den Farbnamen
nennt statt der Gradzahl („Blau, 240 Grad"). Ring und Knopf sind `aria-hidden` — die
Namensgebung sitzt auf dem umschließenden Steuerelement, wie in
[frontend-ui.md](../../../.claude/guidelines/frontend-ui.md) beschrieben.

Tasten: Pfeile ±1°, PageUp/PageDown ±10°, Home/End. `aria-valuenow` trägt den **gerundeten**
Winkel — Ziehen erzeugt Nachkommastellen, die vorzulesen niemandem hilft. Das ist Anzeige; der
abgegebene Guess bleibt exakt (siehe *Guess-Format*).

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

Vier Animationen, alle unter `prefers-reduced-motion` **und** `document.hidden` übersprungen —
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

**2. Das Aufploppen des Bestätigungsknopfs.** Während der Ring entsteht, ist der Knopf **gar nicht
da**. Sobald der Ring geschlossen ist, springt er auf — sehr schnell, deutlich zu groß, und findet
dann federnd in seine Endgröße: kleiner als das Ziel, wieder etwas größer, wieder etwas kleiner,
mit abnehmendem Ausschlag.

```
scale:  0 → 1.18 → 0.94 → 1.06 → 0.98 → 1.00
offset: 0    0.22   0.42   0.62   0.80   1.00      /* ~400 ms gesamt */
```

Die Deckkraft zieht in den ersten ~15 % mit hoch. Der Ausschlag, nicht die Easing-Kurve, macht das
Doing — deshalb stehen die Werte als Keyframes da und nicht als Federparameter.

Das ist die eine Stelle, an der `Element.animate()` richtig ist: ein Element, eine Kurve, kein
zweiter Wert, der mitlaufen müsste. (Der Einflug oben braucht die rAF-Schleife nur, weil dort zwei
Werte mit fester Verzögerung gekoppelt sind.)

Die Animation hat eine Aufgabe über die Zierde hinaus: **sie sagt, wo gespielt wird.** Der Knopf
ist das einzige Element auf dem Screen, das etwas auslöst, und ohne den Auftritt ist er nur eine
farbige Fläche in der Radmitte.

Solange er nicht da ist, ist er auch nicht bedienbar — `:inert="!ready || undefined"`, sonst ließe
sich ein unsichtbarer Knopf per Tabulator erreichen und gedrückt halten. (Die `|| undefined`-Form
ist Pflicht: Vue lässt `inert="false"` sonst im DOM stehen und es wirkt weiter. Siehe
`frontend-ui.md`.)

**3. Der Halte-Ring.** `--hold` läuft in einer rAF-Schleife von 0 auf 1; Loslassen vor dem Ende
lässt ihn sichtbar zurücklaufen. Kein CSS-Übergang, weil Rücklauf und Abschluss-Callback ohnehin
selbst geführt werden.

Der Ring **bleibt unter `prefers-reduced-motion`** — Fortschritt ist Information, keine Zierde; nur
der Rücklauf wird dort sofort.

**Abgebrochen wird auf neun Wegen, jeder mit eigenem Grund:**

- **`pointerup`/`pointercancel`** — das gewöhnliche Loslassen, und der Fall, in dem die Plattform
  die Geste von sich aus kassiert.
- **Ein Daumen, der vom Knopf herunter aufs Rad rutscht.** Implizite Zeiger-Erfassung unterdrückt
  `pointerleave`, solange die Berührung läuft — ohne eine eigene, kreisförmige Trefferprüfung bei
  jedem `pointermove` käme das universelle „Daumen wegziehen, um abzubrechen" auf dem Handy nie an.
- **Ein nicht-primärer Zeiger, oder eine rechte Maustaste, startet gar nicht erst.** Kein Abbruch,
  sondern ein Halten, das nie beginnt — ein zweiter, gleichzeitiger Finger oder ein Rechtsklick
  dürfen nicht mitzählen.
- **`blur`.** Deckt, was `visibilitychange` nicht deckt: ein Fenster, das den Fokus verliert, aber
  sichtbar bleibt — Cmd-Tab während des Haltens ist genau dieser Fall.
- **`@contextmenu.prevent`.** Ein langer Druck neben auswählbarem Text öffnet sonst das
  Kontextmenü, das den Fokus stiehlt, bevor `pointerup` je ankommt.
- **`lostpointercapture`.** Der Browser kann die Zeiger-Erfassung von sich aus zurückziehen; ohne
  diesen Handler bliebe der Zustand hängen.
- **`disabled` schaltet sich mitten im Halten ein.** Ein deaktiviertes Element sendet keine
  Zeiger-Events mehr — ohne diese Prüfung liefe ein laufendes Halten zu Ende und bestätigte etwas
  obendrauf, während zu der Anfrage, die den Abbruch auslöste, schon eine in Arbeit ist.
- **`visibilitychange` nach `hidden`.** Sonst friert die Schleife mitten im Halten ein und läuft
  beim Zurückkommen aus einem veralteten Startzeitpunkt zu Ende — ein Tipp, der abgeschickt wird,
  während niemand hinsah, ist genau das, was die Tastatur-Entscheidung oben ausschließt.

Ein Tastatur-Zustand (`keyHeld`) folgt der Geste durch alle neun Fälle zurück: sonst bliebe eine
per Tastatur gehaltene Taste nach einem Abbruch im Hintergrund „gedrückt", und jeder folgende
`keydown` würde von der Wiederholungssperre verschluckt.

**4. Der Einrast-Puls.** ~200 ms auf dem Mittelknopf nach dem Abschluss, dann steht das Rad.

**Die Haltedauer ist eine Konstante an einer Stelle:** `DEFAULT_HOLD_MS = 1200` in
`ui/useHoldProgress.ts` — dort, weil die Geste sie besitzt, nicht das Rad; ein Aufrufer mit eigener
Meinung überschreibt sie per Prop. Das Original hielt 2000 ms; beim Wiederholen fühlt sich das lang
an. Der Wert gehört im Lab hingedreht — genau dafür ist es da.

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

   Sie soll **nicht stören**: großzügiger Abstand zum Rad, kleinere Schrift, gedämpfte Farbe
   (`mt-8 text-xs text-neutral-500`). Sie ist da, wenn man sie sucht, und tritt sonst zurück —
   das ist der Grund, warum sie überhaupt ohne Aufklapp-Kasten auskommt.

Kein Aufklapp-Kasten. Auf dem Handy ist vertikaler Platz das knappste Gut, und ein Kasten, den
niemand aufklappt, hat keinen Leser. Die HSL-Lehrstunde des Originals entfällt ersatzlos: der
Spieler sieht Sättigung und Helligkeit, er stellt sie nicht ein, und die Namen der Achsen ändern an
seiner Entscheidung nichts.

Kein Kasten im Kasten: die Beschreibung bringt eine Randlinie mit, keinen eigenen Rahmen.

### Nach der Abgabe: eine Liste, kein zweiter Zustand

**Diese Passage ersetzt eine frühere Fassung**, die nach dem Bestätigen eine zweite, provisorische
Karte unter der Spielkarte vorsah („Dein Tipp steht: …°"). Die gibt es nicht mehr: `LabEntries.vue`
ist die einzige Stelle, an der Guesses erscheinen — der eigene eingeschlossen. Das war schon vorher
die Richtung (siehe *`others` bleibt verborgen, bis geraten wurde*), nur stand der eigene Tipp bis
hierhin noch separat.

Die Lab-Seite reicht der Liste den eigenen Eintrag zuerst, dann `others`:
`me ? [me, ...others] : others`. Vor dem eigenen Guess ist das leer — der Server hält `others`
zurück, solange `me` null ist — und die Liste rendert dafür nichts, keinen leeren Kasten. Nach dem
eigenen Guess enthält sie mindestens den eigenen Eintrag.

Zwei Karten nebeneinander sagten von selbst, dass die zweite nicht zum Spiel gehört — eine
zusätzliche Liste sagt stattdessen, dass der eigene Guess derselben Buchführung angehört wie jeder
andere. Das Board weiß dadurch weiterhin nur `initHue` und `disabled`; einen Begriff von „mein
Tipp" hat es nach wie vor nicht.

**`myGuess` bleibt trotzdem im Lab-Adapter.** Es füttert `me.guess.hue ?? payload.initHue` als
Startwinkel des Rads. Ohne das stünde das Rad nach einem Reload auf `initHue` statt auf dem
abgegebenen Tipp — der Zustand würde lügen. `me.guess` steht ohnehin in der Antwort; nur die
provisorische zweite Karte, die ihn zusätzlich noch einmal anzeigte, ist entfallen.

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
  Board die Beschreibung rendert und beim Abschluss `guess` mit dem **exakten** Winkel emittiert.
- Der Bestätigungsknopf trägt `inert`, solange der Ring noch entsteht — und trägt es **nicht**,
  wenn Einflug und Aufploppen übersprungen werden. Beides ist ein Attribut, also prüfbar; der
  Ausschlag der Feder ist es nicht und gehört in die manuelle Verifikation.
- Die Lab-Seite reicht `LabEntries.vue` `[me, ...others]`, wenn `me` steht, sonst nur `others` — und
  die Liste rendert sich selbst gar nicht, wenn das Ergebnis leer ist.

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
