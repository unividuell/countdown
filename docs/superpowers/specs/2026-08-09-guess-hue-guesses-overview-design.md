# Guess Hue — die Tippübersicht im Farbrad

**Status:** beschlossenes Design (2026-08-09).

**Baut auf:** [Eingabeseite](2026-08-08-guess-hue-input-design.md) (das Rad, das Board, der
Lab-Adapter), [Datenset-Spec](2026-08-07-guess-hue-dataset-design.md) (die geerbte Toleranz von
±10°) und [Game-Lab-Spec](2026-08-08-game-lab-design.md) (der Vertrag, der hier erweitert wird).

**Portiert aus:** `huettehuette.unividuell.org`,
`components/games/guessColor/GuessColorResults.vue` — das Canvas-Rad mit den Markern. Übernommen
wird die **Idee**, nicht der Code. (`GuessColorAnalysis.vue`, die Tabelle darunter, ist nicht Teil
dieses Schnitts.)

## Scope

Gebaut wird das, was nach der eigenen Abgabe im Rad zu sehen ist: **alle abgegebenen Tipps als
Marker** und **die Toleranzgrenzen** um die Lösung.

Nur das Rad. Keine Auswertungstabelle, keine Punkte, keine Wertung — `LabGame.score` gibt
weiterhin `null`. Die Toleranz wird **gezeichnet, nicht geprüft**.

Der heutige `disabled`-Zustand des Rads — Graustufen auf dem Band — war ein Provisorium für
„Runde verbraucht" und **entfällt ersatzlos**. `disabled` heißt ab hier nur noch „nimmt gerade
keine Eingabe an" (eine laufende Anfrage); diesen Zustand zeigt der Mittelknopf, der ihn ohnehin
hat.

## Backend

### Ein zweiter Weg aus dem Server, an genau einer Bedingung

Die Toleranzgrenzen sitzen um die Lösung, und die verlässt den Server bisher nirgends:
`GuessHuePayload` ist per Feldmengen-Test auf `description`, `initHue`, `saturation`, `lightness`
festgenagelt. Die Lösung **nachträglich ins Payload zu legen wäre der falsche Weg** — sie stünde
dann auch vor dem Guess in der Antwort, und der Hygiene-Test verlöre seine Bedeutung.

Stattdessen ein eigenes Feld neben dem Payload, mit eigener Schranke:

```kotlin
interface LabSolution

interface LabGame {
    // …
    /**
     * What may be shown once the viewer has spent their guess. `null` — the default — is a game
     * that reveals nothing.
     */
    fun solution(seed: Int): LabSolution? = null
}
```

`LabGame.reveal(seed)` heißt schon so und liefert das Payload; der neue Weg braucht deshalb einen
eigenen Namen. Dass die Schnittstelle sich dafür ändert, ist kein Bruch, sondern die in
[game-lab.md](../../../.claude/guidelines/game-lab.md) vorgeschriebene Richtung: „ein expliziter
Reveal-Schritt" steht dort wörtlich als Beispiel für eine Änderung, die das Lab trägt und nicht das
Spiel.

**Hier ist ein Default richtig, anders als bei `revealsOthersBeforeGuess`.** Dort ist die unsichere
Richtung („zeigen") die bequeme, deshalb muss jedes Spiel sich äußern. Hier ist der Default die
sichere Richtung: wer nichts implementiert, enthüllt nichts. `SampleLabGame` bleibt unangetastet.

```kotlin
data class GuessHueSolution(
    val targetHue: Double,
    /** Half-window, in degrees: the guess counts from `targetHue - it` to `targetHue + it`. */
    val toleranceDeg: Double,
) : LabSolution
```

In `LabService.respond` eine Zeile:

```kotlin
solution = if (mine == null) null else game.solution(seed),
```

**Nicht an `revealsOthersBeforeGuess` gekoppelt.** „Andere sehen" und „die Lösung sehen" sind zwei
Fragen; für die zweite gibt es im Lab nur eine sinnvolle Antwort. Wer „Meinen Guess löschen"
drückt, steht wieder vor der Schranke: `solution` wird wieder `null`, die Karte klappt auf Eingabe
zurück.

### Die Toleranz kommt vom Server

±10° stehen als geerbte Mechanik bereits im Datenset-Spec. Sie bekommen im `guesshue`-Modul eine
öffentliche Konstante und werden **mitgeschickt statt im Client hartkodiert**. Der Client zeichnet,
was ihm gesagt wird — und wenn Phase 2 die Toleranz später aufhebt, ist das eine Zahl im Server und
kein Frontend-Release. Ein `toleranceDeg` von 0 zeichnet nur die Lösungslinie, keinen Sektor.

Das ist keine Wertung: es wird nichts verglichen und nichts gepunktet.

### Tests

- Feldmengen-Test für `GuessHueSolution` — `targetHue`, `toleranceDeg`, sonst nichts. Dieselbe
  Begründung wie beim Payload: eine neue Zahl, die etwas *einengt*, fällt nur so auf.
- `solution(seed)` ist deterministisch je Seed und stimmt mit dem Target aus `dataset.draw` überein.
- `SampleLabGame.solution` ist `null` (der Default trägt).
- In `LabServiceTest`: `solution` ist `null`, solange `me` null ist; gefüllt, sobald nicht; und nach
  `forgetMine` wieder `null`.

## Frontend

### Bausteine

| Datei | Aufgabe | neu? |
| --- | --- | --- |
| `games/guesshue/ring.ts` | `ringStyle({ saturation, lightness, innerFraction, sweep? })` → `CSSProperties`: Verlauf, Annulus-Maske, optional die Einflug-Maske | neu (aus `HueWheel` gelöst) |
| `games/guesshue/HueRing.vue` | ein `<div>` mit genau diesem Style — der gemeinsame Ring beider Räder | neu |
| `games/guesshue/HueWheelInput.vue` | das heutige `HueWheel.vue`: Zeiger, Tastatur, ARIA-Slider, Einflug, Knopf, Mitten-Slot | umbenannt |
| `games/guesshue/reveal.ts` | rein: Stapelzuordnung, Bahn-Radien, Band-Innenkante, Sektor-Pfad | neu |
| `games/guesshue/HueToleranceSector.vue` | Sektor und Lösungslinie als SVG | neu |
| `games/guesshue/HueWheelReveal.vue` | das Lese-Rad: Ring, Marker, Sektor. Keine Interaktion, kein Mitten-Slot | neu |
| `games/guesshue/GuessHueBoard.vue` | die Eingabekarte — wie heute, nur mit `HueWheelInput` | bleibt |
| `games/guesshue/GuessHueReveal.vue` | die Auswertungskarte: dasselbe Zitat, das Lese-Rad | neu |

**Zwei Räder über einem gemeinsamen Ring, nicht ein Rad mit einer Phase.** Das Eingabe-Rad ist
Zeigergeometrie, Tastatur und ARIA-Slider; das Lese-Rad ist ein Bild. Sie teilen sich genau eine
Sache — den gemalten Ring —, und die ist fast vollständig Arithmetik, also eine reine Funktion mit
einer dünnen Komponente darum.

**Der Umschalter sitzt im Lab-Adapter** (`gamelab/GuessHueLabGame.vue`), nicht im Board: er ist die
Stelle, die `unknown` zu getippten Werten macht.

### Zwei neue Props im Lab-Komponentenvertrag

- `solution: unknown` — was der Server enthüllt hat, oder `null`
- `entries: LabEntryDto[]` — die sichtbaren Einträge in der Reihenfolge, die die Lab-Seite ohnehin
  schon bildet (meiner zuerst)

`SampleGame.vue` ignoriert beide. `myGuess` bleibt daneben bestehen: es ist zwar aus `entries`
ableitbar, hat aber einen eigenen dokumentierten Zweck — den Startwinkel des Rads nach einem
Reload — und `SampleGame` hängt daran.

Beide werden im Adapter **defensiv verengt**, wie es der Vertrag verlangt: `solution` muss zwei
endliche Zahlen tragen, sonst bleibt die Eingabekarte stehen; ein Eintrag ohne endliches
`guess.hue` fällt aus der Markerliste, statt als `NaN` in eine Transformationsmatrix zu geraten.

### Geometrie

Radien sind Brüche des **Radradius**, die Markergröße ist ein Bruch der **Radbreite** — so steht es
heute schon im Rad (`KNOB_TRACK_FRACTION` gegen `size-[9%]`), und daran ändert sich nichts. Marker
und Zeigerknopf teilen sich dafür **eine** Konstante: `KNOB_SIZE_FRACTION` (0,09) zieht aus
`HueWheel.vue` nach `wheel.ts` um. „Der Guess überlagert den Knopf exakt" ist damit gebaut und
nicht nachgerechnet.

```
Bahn k:       KNOB_TRACK_FRACTION − k · STACK_STEP     (0,89 − k · 0,10)
Band-Innen:   BAND_INNER_FRACTION − K · STACK_STEP     (0,78 − K · 0,10),  K = tiefster Stapel
```

Dieselbe Subtraktion für beide. Deshalb liegt jeder Marker mit demselben Rand auf Farbe statt
daneben, und bei `K = 0` ändert sich am Band nichts.

**Das Band wächst nach innen, die Marker wandern nicht heraus.** Das ist die Beobachtung aus dem
Original: bei vier identischen Tipps ist der Ring sichtbar breiter, nicht der Stapel länger ins
Loch hinein.

Boden: das Band wird nie enger als `0,25`. Ab `K ≥ 6` schrumpft `STACK_STEP` auf `(0,78 − 0,25) / K`,
statt das Loch zu schließen — die Marker überlappen dann stärker, das Rad bleibt ein Rad.

**Stapelzuordnung.** Mein Marker liegt **immer auf Bahn 0** — sonst stimmt die Überlagerung des
Zeigerknopfs nicht mehr. Die übrigen werden nach Winkel sortiert (bei Gleichstand nach `userId`,
damit das Bild über Reloads stabil ist) und bekommen greedy die niedrigste freie Bahn, auf der kein
Nachbar näher als `COLLISION_WINDOW_DEG` liegt. Abstand auf dem Kreis, also `min(|a−b|, 360−|a−b|)`:
die 0°-Naht ist keine Sonderregel, sondern fällt aus der Formel.

`COLLISION_WINDOW_DEG` ist **10°**. Ein Marker auf Bahn 0 deckt selbst rund 11,6° ab
(`2 · asin(0,09 / 0,89)`), der Wert liegt also bewusst leicht darunter: eine Berührung an den Rändern
ist noch lesbar, und jedes Grad, das er größer ist, macht Stapel tiefer als nötig. Er steht als
Konstante bei den übrigen und gehört im Lab an echten Runden hingedreht.

*(Das Original rechnete hier order-abhängig gegen eine wachsende Liste und verglich die Grenzen
ohne Umlauf — über 0° hinweg stapelte es nicht. Übernommen wird die Idee des radialen Stapels,
nicht diese Schleife.)*

**Marker.** Ein gefüllter Kreis in der Avatarfarbe mit weißem Rand, ohne Beschriftung — wie im
Original. Kein Kürzel: vier Zeichen auf 29 px neben einem Regenbogenring sind nicht lesbar, und wer
wissen will, wer wo steht, hat die Einträge-Liste direkt darunter. Auch **mein eigener Marker ist
nicht hervorgehoben** — er ist der, der aus dem Zeigerknopf hervorgeht, und das sagt die
Choreografie deutlicher als ein Sonderstil.

### Der Sektor

Ein SVG mit Einheits-`viewBox` über dem Ring, `aria-hidden` — die Aussage gehört auf das Rad als
Ganzes, nicht auf eine seiner Schichten (siehe *Was ein Screenreader hier bekommt*).

- **Gestrichelt:** zwei Grenzlinien bei `targetHue ± toleranceDeg`, dazu gestrichelte Bögen auf
  Innen- und Außenkante — das Fenster, geschlossen.
- **Durchgezogen:** eine dünne Linie in der Mitte des Fensters — die Lösung.

Gestrichelt heißt Grenze, durchgezogen heißt Lösung; das ist der ganze Schlüssel. **Das Original
zeichnete die Lösung nicht**, solange die Toleranz galt — aber die Mitte eines 20°-Fensters ist
ohnehin ablesbar, und „wie weit war ich weg" ist die Frage, die man an das Bild stellt. Sie zu
verschweigen kostet Klarheit und gewinnt nichts.

Alle Linien reichen nur über das Band, nicht bis in die Mitte: das Loch bleibt leer. Tinte ist
`readableTextColor` gegen die Lösungsfarbe — dieselbe Idee wie `readableColor` im Original, nur mit
unserem eigenen Helfer.

### Was aus dem Eingabezustand verschwindet

Der **Zeigerknopf** und der **Mittelknopf**. Der Zeigerknopf ist nach der Abgabe eine Dublette
meines eigenen Markers; die Mitte wird das leere Loch des Originals.

Erwogen und verworfen: die Lösungsfarbe als Scheibe in die Mitte zu legen. Das Rad beantwortete
damit „welche Farbe war gemeint" ohne Umweg über den Sektor — aber es macht aus einem Bild über
Winkel ein Bild über zwei Dinge, und der Sektor sagt das Nötige bereits.

### Die Karte darf ihre Höhe ändern

Unter dem Rad steht auf der Auswertungskarte **nichts**. Die Hinweiszeile der Eingabekarte („Du
stellst nur den Farbton ein…") ist hier falsch, und eine Zeile mit den Zahlen — Lösung,
Toleranzfenster, Abweichung — wäre ein Provisorium: an diese Stelle kommt später die
Detailtabelle aller Tipps (im Original `GuessColorAnalysis.vue`), und die ist nicht Teil dieses
Schnitts.

Die Karte wird beim Übergang also **kürzer**, und später mit der Tabelle wieder deutlich länger.
Das ist die Entscheidung, nicht ein Nebeneffekt: eine Zeile einzuziehen, nur damit die Höhe
gleich bleibt, würde eine Zeile bauen, die wieder verschwindet. Wie der Höhenwechsel mitten in
der Choreografie wirkt, sehen wir im Lab — genau dafür ist es da, und wenn es stört, ist die
Antwort ein Übergang auf der Höhe und keine Füllzeile.

Beide Karten liegen während des Übergangs in **derselben Rasterzelle** (`grid-area: 1 / 1`) statt
absolut positioniert übereinander: so bleibt die Höhe der Umgebung die der jeweils höheren Karte
und fällt am Ende von selbst auf die der Auswertungskarte.

### Was ein Screenreader hier bekommt

Das Lese-Rad ist `role="img"` mit einem knappen `aria-label`, das Lösung und Toleranzfenster nennt;
die Schichten darin (Ring, Sektor, Marker) sind `aria-hidden`.

**Das ist bewusst weniger als Parität.** Wer sieht, liest aus dem Bild auch ab, wie die Tipps
zueinander stehen; das Label sagt nur, wo die Lösung liegt. Die vollständige Aussage ist die
Detailtabelle mit allen Tipps — sie ist die richtige Form dafür, weil sie eine Tabelle ist, und
sie kommt in einem eigenen Schnitt. Bis dahin stünde ohne Label gar nichts da, und das wäre
schlechter als eine bekannte Lücke.

### Choreografie

Das Reveal ist der Moment, in dem die Runde sich auflöst — es darf Spannung haben. Vier Takte,
zusammen rund 3 Sekunden:

| Takt | wann | was | was man erfährt |
| --- | --- | --- | --- |
| 1 | 0 ms | der Mittelknopf verlässt die abgehende Karte | die Eingabe ist vorbei |
| 2 | ~200 ms | Überblendung der Karten: mein Marker liegt auf dem Knopf, es wechselt die Füllfarbe | das ist mein Tipp |
| 3 | ~900 ms | der Toleranzsektor blendet ein | wie gut habe ich getippt |
| 4 | ~1900 ms | die anderen Marker erscheinen gestaffelt, das Band wächst nach innen | wie gut war ich im Vergleich |

Zwischen den Takten steht jeweils eine Pause; sie ist der Grund, warum das Ganze 3 s dauern darf.

**Getaktet wird über CSS-Verzögerungen der `<Transition>`, nicht über eine Uhr.** Takt 1 ist ein
eigener, kürzerer Leave-Übergang des Mittelknopfs innerhalb der abgehenden Karte — deshalb braucht
er keine komponentenübergreifende Zustandsmaschine. Takt 2 ist der Karten-Übergang selbst: beide
Karten liegen währenddessen deckungsgleich übereinander, und weil der Marker per Konstruktion auf
demselben Radius und demselben Winkel sitzt wie der Knopf, liest sich die Überblendung als
Farbwechsel eines Kreises.

**Eine rAF-Schleife gibt es genau für das Band.** Die Innenkante steckt in einem Masken-Verlauf, und
Verläufe interpolieren als `mask-image` nicht verlässlich — eine gewöhnliche Transition darauf
springt. Der andere Weg wäre eine per `@property` registrierte Prozent-Variable im Verlauf; die
rAF-Schleife gewinnt, weil das Eingabe-Rad dieselbe Schleifenform für den Einflug schon kennt und
der Endzustand bei übersprungener Bewegung damit an genau einer Stelle gesetzt wird. Alles andere ist
Deckkraft und Verzögerung.

Die Zahlen stehen als benannte Konstanten beieinander — sie sind ein erster Vorschlag und gehören
im Lab hingedreht, genau dafür ist es da.

**Ein Reload spielt das nicht nach.** Die `<Transition>` bekommt kein `appear`; wer die Seite in
einer bereits gespielten Runde neu lädt, sieht das fertige Bild. Spannung gehört zum Moment der
Abgabe, nicht zur Ladezeit. Unter `prefers-reduced-motion` und bei `document.hidden` gilt dasselbe —
Endzustand sofort, wie überall in diesem Spiel.

## Tests

**Backend:** siehe oben.

**Frontend.**

- `reveal.spec.ts` — mein Marker auf Bahn 0; Stapel über die 0°-Naht hinweg; Bahnen und
  Band-Innenkante je Tiefe; der Boden ab `K ≥ 6`; stabile Reihenfolge bei gleichem Winkel;
  Sektor-Endpunkte für ein Fenster, das über 0° läuft.
- `ring.spec.ts` — die Innenkante landet in der Maske; die Einflug-Maske komponiert mit ihr statt
  sie zu ersetzen; kein Graustufen-Filter mehr.
- `HueWheelReveal.spec.ts` — ein Marker je Eintrag mit Farbe und Drehung; Einträge ohne endliches
  `hue` fallen raus; `role="img"` mit Lösung und Fenster im Label; kein `role="slider"` und keine
  Zeiger-Handler.
- `GuessHueLabGame.spec.ts` — die Karte wechselt bei `solution != null` und zurück, sobald es
  wieder `null` ist; Müll in `solution` lässt die Eingabekarte stehen.
- `HueWheel.spec.ts` wandert zu `HueWheelInput.spec.ts`; die Graustufen-Zusicherung entfällt mit dem
  Verhalten.

**Was die Tests nicht abdecken:** wie das Bild aussieht. Die Radien sind Brüche, die sich prüfen
lassen, aber ob ein sechsfacher Stapel noch lesbar ist und ob die drei Pausen sich richtig anfühlen,
ist eine Browsermessung.

**Manuell verifiziert** wird gegen `/c/{slug}/lab/guess-hue?seed=…`: schmal und breit, mit mehreren
Testnutzern für echte Stapel (inklusive des Extremfalls „alle raten dasselbe"), einmal mit
reduzierter Bewegung, und einmal mit „Meinen Guess löschen" für den Rückweg. Ausdrücklich
mitbeurteilt wird dabei der **Höhenwechsel der Karte** — siehe *Die Karte darf ihre Höhe ändern*.

## Bewusst nicht übernommen

- **Das Canvas.** Das Original malte in ein `<canvas>` und musste dafür DPR skalieren, bei jeder
  Änderung neu zeichnen und einen `watch` über drei Quellen laufen lassen („this gets called (too)
  many times (3-4x)" steht als Kommentar darin). Marker sind bei uns dieselben absolut
  positionierten Elemente wie der Zeigerknopf, der Sektor ist ein SVG mit Einheits-`viewBox`.
  Beides skaliert von selbst und ist ohne Layout prüfbar — was happy-dom für Canvas nicht ist.
- **Die Detailtabelle** (`GuessColorAnalysis.vue`). Sie ist der nächste Schnitt, nicht dieser: sie
  gehört unter das Rad, sie bringt die vollständige Screenreader-Aussage mit, und ein Teil ihrer
  Spalten (Differenz, Punkte) hängt an der Wertung. Solange sie fehlt, zeigt die Einträge-Liste des
  Labs Name und Winkel.
- **Der hervorgehobene eigene Marker.** Erwogen; die Choreografie sagt es deutlicher.
