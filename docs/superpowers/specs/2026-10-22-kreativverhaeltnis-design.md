# Kreativverhältnis („Paint Ratio“) — ein Gemälde mit demselben Farbanteil

**Status:** beschlossenes Design (2026-10-22).

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), den
[Runden-Assets](2026-10-17-round-assets-design.md) und dem [Spiel-Labor](2026-08-08-game-lab-design.md).
Phasen und Punkte übernimmt es wörtlich von [Farbausmalung](2026-08-07-guess-hue-dataset-design.md)
(`guess-hue`): kein Aufdecken, keine Uhr, Toleranz nur in Phase eins. Die antippbaren Namen in der
Rangliste kommen von [Entstauber](2026-09-14-entstauber-design.md) und Blockierung, den Entwurf auf dem
Gerät von [Blockierung](2026-10-16-blockierung-design.md).

**Portiert:** `Ratio` aus `huettehuette` (`components/games/ratio/`, `composables/games/ratio/`). Die
Spielidee wird übernommen, der Code nicht.

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md), mit der Decke „Lösung liegt im
Sichtbaren“, benannt unter *Integrität*.

**Berührt:** ein neues Modulith-Modul `paintratio` (reine Logik, **kein Schema, keine Tabelle**), den
Adapter `PaintRatioGameType` in `game.internal`, im Frontend ein neues Spielverzeichnis
`games/paintratio/` plus die Einträge in `games/registry.ts` und `gamelab/games.ts`, und eine kleine
Erweiterung des geteilten `HoldButton` (der Fortschritt muss nach außen).

## Zweck & Spielidee

Das „Kollektiv Kommune“ hat ein Bild gemalt: Funken, eine raue Ellipse, ein Gekritzel. Der Spieler
malt **sein eigenes** Gemälde, das **denselben Anteil bemalter Fläche** hat. Wie es aussieht, ist egal.

Es ist das einzige kreative Spiel der Plattform. Was es trägt, laut Clemens:

- **Malen und Wischen macht für sich schon Spaß.**
- **Die Gemälde danach gemeinsam anzuschauen ist witzig.** Sie werden in der Auflösung und in der
  Historie veröffentlicht.
- **Das Abschätzen ist schwer, und das soll so bleiben.** Die Vorlage verschwindet mit dem ersten
  Strich, also braucht man vorher einen Plan. Die rauen Formen (Schraffur mit Lücken, ein Umriss, der
  keine volle Ellipse ist, Fransen über den Rand) machen das Schätzen erst schwierig. Die Werke des
  Kollektivs waren im Original „nicht sehr kreativ, aber gerade schwer genug“.

Was im Original schiefging und hier strukturell verschwindet:

- **Falsch berechnete Tipps.** Das Original zählte im Canvas jedes Pixel mit `alpha > 0`. Damit zählt
  jeder nur angeschnittene Pixel am geglätteten Rand voll, und wie viele das sind, hängt von der
  Pixeldichte ab. Bei Funken mit 5 px Radius sind das grob +30 % bei DPR 1 und +10 % bei DPR 3. Das Ziel
  wurde auf dem Gerät des Admins gemessen, der Tipp auf dem des Spielers. Dazu verrauscht
  Anti-Fingerprinting in manchen Browsern `getImageData`. Es gab dafür einen „Ratio Debugger“ und einen
  „Ratio Doctor“. **Hier misst nur der Server, und nie aus einem Canvas** (siehe *Die Zählregel*).
- **Versehentliche Abgabe.** Ein Spieler hat mindestens zweimal unabsichtlich abgegeben,
  vermutlich mit dem Handballen beim Malen auf dem Halteknopf. Der Knopf wurde daraufhin weit aus dem
  Sichtfeld geschoben, was hässlich aussah. **Hier sperrt das Halten die Leinwand** (siehe *Brett*),
  und der Knopf darf direkt unter dem Bild liegen.

- **Codename:** `paint-ratio` (Game-ID), `paintratio` (Modul), `PaintRatio*` (Klassen).
- **Anzeigename:** „Kreativverhältnis“, der Name des Originals.
- **Der Künstler:** „Kollektiv Kommune“, wie im Original.

## Die Regeln

**Gewertet wird der Anteil bemalter Fläche:** bemalte Felder ÷ alle Felder der Leinwand. Die Farbe
spielt keine Rolle, auch Weiß zählt. Mehrfach bemalte Stellen zählen einmal.

**Die Phasen — wörtlich die von Farbausmalung:**

| | Phase eins | Phase zwei |
|---|---|---|
| Aufdecken | nein, das Brett ist sofort da | nein |
| Zeit | läuft nicht ins Ergebnis ein | läuft nicht ins Ergebnis ein |
| Gate | Abweichung ≤ Toleranz der Form | keins |
| Award | `ALL_QUALIFYING`: jeder Treffer 1 Punkt | `CLOSEST_ONLY`: die kleinste Abweichung nimmt alles |

Im Vertrag: `requiresReveal = scoresOnDuration = false`, unbedingt, wie bei Farbausmalung.
`deviation = |Anteil − Zielanteil|`. Gleich gute Tipps bekommen beide die Punkte, die Regel des
Frameworks. Es gibt genau einen Tipp pro Spieler und Runde.

**Die Vorlage verschwindet mit dem ersten Strich.** Ein Blick zurück ist **erlaubt, und zwar mit
Absicht** (Clemens): Rückgängig bis zum letzten Strich zeigt die Vorlage wieder, Wiederholen bringt die
Malerei zurück, ein neuer Strich räumt die Vorlage weg und verwirft den Wiederholen-Stapel. Genau so
verhielt sich das Original.

## Die Leinwand

```
W = 1200, H = 900      // Leinwand in Einheiten, 4 : 3 wie im Original
PINSEL = [40, 80, 160] // Durchmesser in Einheiten; im Original 10/20/40 CSS-px auf 300 px Breite
```

Die Leinwand hat **logische Einheiten**, unabhängig vom Bildschirm. 1200 Einheiten entsprechen auf einem
Telefon (360–430 CSS-px × DPR 3) ungefähr einem Gerätepixel. Ein Feld ist eine Einheit im Quadrat; die
Leinwand hat `W × H = 1 080 000` Felder.

**Flexibel ohne Regler**, wie bei Platzierung: `width`, `height` und `brushes` werden in den Params
eingefroren, und alles danach liest nur dort, nämlich Zählung, Bild, Frontend und Historie. Eine andere
Leinwand ist später eine Änderung dieser Konstanten; alte Runden behalten ihre Werte.

## Die Zählregel

Eine Regel für alles, was gezählt wird: die Werke des Kollektivs und die Gemälde der Spieler.
`paintratio` rastert selbst. **Kein Java2D, kein Canvas, keine Kantenglättung.**

- Ein Feld `(i, j)` hat seine Mitte bei `(i + ½, j + ½)`. Es ist bemalt oder nicht.
- **Kapsel:** ein Strichstück von `p` nach `q` mit Radius `r`. Ein Feld ist bemalt, wenn seine Mitte
  höchstens `r` von der Strecke `pq` entfernt liegt. Bei `p = q` ist das eine Scheibe, also ein Tupfer.
- **Fläche:** ein Vieleck mit Gerade-ungerade-Regel. Ein Feld ist bemalt, wenn seine Mitte innen liegt.
- Kurven (Ellipsen, die Bögen der rauen Linien) werden vorher in Polylinien zerlegt.
- Was mehrfach bemalt wird, zählt einmal. Was außerhalb der Leinwand liegt, zählt nicht.

**Exakt für die Spieler.** Strichpunkte sind ganzzahlige Einheiten, Radien ganzzahlig. Mit verdoppelten
Koordinaten liegt jede Feldmitte auf ganzen Zahlen, und der Kapseltest läuft in `Long`-Arithmetik ohne
Wurzel und ohne Rundung: Projektion über das Skalarprodukt, senkrechter Abstand über
`kreuz² ≤ r² · |q − p|²`. Bei den Werken des Kollektivs mit `Double`-Koordinaten genügt
Gleitkomma, denn nur der Server rechnet.

**Kein Fall für [cross-runtime-parity](../../../.claude/guidelines/cross-runtime-parity.md):** der
Client rechnet nie einen Anteil. Er zeigt nur.

**Leistung.** Rastern über Zeilenspannen: pro Kapsel und Zeile das überdeckte Intervall berechnen, die
Randfelder mit dem exakten Test bestätigen. Budget: ein Tipp an der Obergrenze (siehe *Der Tipp*) ist in
unter einer Sekunde gezählt.

**Statt „Ratio Doctor“ ein Test.** Feste Striche müssen feste Zahlen ergeben; eine einfache
Referenzschleife über alle Felder prüft den schnellen Rasterer.

## Die Werke des Kollektivs

Der Server zeichnet die Vorlage beim Ziehen selbst. **Zehn Formen**, gleichverteilt gezogen aus denen,
die diese Edition noch nicht hatte (`context.previousParams`); bleibt keine übrig, zählen wieder alle —
wörtlich die Regel, mit der Entstauber seine Bilder zieht. `previousParams` ist ungeordnet, eine Regel
„nicht wie die Vorrunde“ ließe sich daraus nicht lesen.

| Form | Beschreibung | Toleranz Phase eins |
|---|---|---|
| `SPARKLE` Funken | 10–2000 Tupfer, Radius 20, gleichmäßig verteilt, `#EFC202` (Original) | 5 % |
| `CIRCLE` Kreis | rau, Mitte 40…W−40 / 40…H−40, Radius 40–600 (Original) | 1 % |
| `ELLIPSE` Ellipse | rau, Mitte wie Kreis, Breite 40–1200, Höhe 80–1200, darf hinausragen (Original) | 1 % |
| `REGION` Region | 3–90 Punkte über die ganze Leinwand, ein Vieleck, Gerade-ungerade, scharf, grün (Original) | 8 % |
| `POLYGON` Vieleck oder Stern | rau, 3–8 Ecken oder 5–9 Zacken | 1 % |
| `RING` Ring | raue Ellipse mit Loch | 1 % |
| `STRIPES` Streifen | einige dicke, raue Linien quer übers Bild | 3 % |
| `SPLATTER` Spritzer | Tupfer in verschiedenen Größen, in Häufungen | 5 % |
| `FREEHAND` Freihand | das Kollektiv malt mit den Werkzeugen der Spieler (siehe unten) | 5 % |
| `COMPOSITION` Komposition | zwei bis drei andere Formen übereinander | 8 % |

Die Toleranzen der vier Originalformen sind die des Originals, die übrigen meine Startwerte. Nachgestimmt
wird im Labor. Die Toleranz ist ein Absolutwert in Prozentpunkten des Anteils, wie im Original.

Die Bereiche der Originalformen sind die des Originals, vom 300 × 225-Canvas mit Faktor 4 übertragen.
Die Bereiche der neuen Formen legt der Umsetzer fest, mit Blick aufs Labor.

**Mindestziel: der Zielanteil ist mindestens die doppelte Toleranz seiner Form** (Clemens, nach dem
Gegenlesen). Ohne diese Regel trifft in Phase eins ein einziger Tupfer jedes Ziel, das kleiner ist als
die Toleranz: zehn Funken (ca. 1,2 %) gegen 5 %, ein kleiner Kreis gegen 1 %, eine Region aus drei
Punkten (im Mittel ca. 7,6 %) gegen 8 % — grob 2–3 % aller Runden, im Original genauso. Ab der doppelten
Toleranz verfehlt ein Tupfer immer.

- Liegt ein Werk darunter, zieht `draw` einen neuen `artSeed` aus demselben Strom, die Form bleibt. So
  bleibt die Verteilung der Formen gleich, und der Zug ist deterministisch.
- Die Regel gilt **in beiden Phasen** mit der Toleranz der Form aus Phase eins: eine Form sieht in
  beiden Phasen gleich aus.
- Nach 100 Versuchen scheitert `draw` laut (`check`). Das passiert nur mit einem kaputten Zeichner;
  die Bereiche der neuen Formen sind so zu wählen, dass das Mindestziel meist beim ersten Zug hält.

### Der raue Strich, nach roughjs

Kreis, Ellipse, Vieleck/Stern, Ring und Streifen tragen den Look von [roughjs](https://roughjs.com)
(MIT, Preet Shihn). Nachgebaut wird das Verfahren in Kotlin, nicht der Code, und auch nicht dessen
Zufallsfolge:

- **Umriss:** schwarz, Strichbreite ca. 4 Einheiten, **zweimal** gezogen, jeweils mit eigenem Zittern
  der Stützpunkte und leichter Wölbung. Darum ist es „keine volle Ellipse“.
- **Füllung:** parallele Linien im Winkel um −41° (roughjs-Standard), Linienbreite ca. 16 Einheiten
  (Original: `fillWeight 4`). Jede Linie ist selbst rau, und ihre Enden zittern über den Umriss hinaus.
  Daher kommen die Fransen, die die Screenshots des Originals zeigen.
- **Füllart, pro Runde gezogen:** Schraffur, Kreuzschraffur, Zickzack oder Punkte.
- **Dichte, pro Runde gezogen:** der Abstand der Füllinien, von „fast deckend“ (Original, ca. 16
  Einheiten) bis „locker“ (ca. 64).

Füllart und Dichte machen aus einer Form viele. Ein mit Punkten gefüllter Kreis wirkt groß und bemalt
wenig. Die Region bleibt scharf und deckend, so wie im Original; ihre Schwierigkeit ist die
Selbstüberschneidung.

Eine Quellenangabe auf roughjs gehört in den Kopfkommentar der nachgebauten Datei.

### Freihand

Das Kollektiv malt mit **denselben Werkzeugen** wie die Spieler und wird mit **derselben Regel**
gezählt: 1–5 Striche, jeder mit einem der drei Pinsel und einer Farbe aus einer festen Palette. Die Bahn
ist ein gesteuerter Zufallsweg: eine Richtung, die sich über geglättetes Rauschen dreht, mit Schwüngen,
Schleifen und Zickzack. Sie darf die Leinwand verlassen und zurückkehren. Länge und Krümmung legt der
Umsetzer fest.

### Komposition

Zwei bis drei Elemente aus den anderen Formen, ohne Komposition selbst, übereinander gemalt. Sie
überlappen. Überlappungen zählen einmal, genau wie beim Spieler, und genau das macht sie schwer.

## Der Zug

```kotlin
data class PaintRatioParams(
    val shape: Shape,          // eine der zehn Formen
    val artSeed: Int,          // reproduziert das Werk Strich für Strich
    val width: Int,
    val height: Int,
    val brushes: List<Int>,    // Durchmesser in Einheiten
    /** Bemalte Felder des Werks — das Rundengeheimnis, eingefroren. */
    val targetCells: Int,
    /** Toleranz in Phase eins als Anteil (0.01 = 1 %); `null` in Phase zwei, wie `toleranceDeg`. */
    val tolerance: Double?,
)
```

**Alles aus dem Presentation-Strom.** Bei einem Spiel ohne Aufdecken ist das Werk sofort sichtbar, und
der Zielanteil folgt daraus. Es gibt nichts zu verbergen, das nicht schon im Bild steht. Gezogen wird
also `shape` und `artSeed` aus `random.presentation`; der Solution-Strom bleibt ungenutzt.

**`targetCells` wird beim Ziehen gezählt und eingefroren.** `draw` rendert das Werk einmal und zählt.
`produceAssets` rendert es aus denselben Params erneut für das Bild und **prüft, dass die Zahl gleich
ist** (`check`, sonst scheitert die Materialisierung laut). Eine spätere Änderung am Zeichner verändert
damit nur neue Runden, und Zählung und Bild können nie auseinanderlaufen.

**`tolerance`** = Toleranz der Form in Phase eins, `null` in Phase zwei.

**Verfügbar** ist das Spiel immer (`isAvailable` bleibt beim Standard).

## Das Bild

Ein Asset, `target`, PNG mit Alpha, `W × H` Pixel: **genau das Raster, das gezählt wurde**. Jedes
bemalte Feld trägt die Farbe der Form, die es zuletzt bemalt hat, jedes andere ist durchsichtig. Was der
Spieler sieht, ist das, was gezählt wurde.

| Asset | Sichtbarkeit | warum |
|---|---|---|
| `target` | `FromStage(0)` | kommt aus dem Presentation-Strom; bei einem Spiel ohne Aufdecken öffnet das automatische Öffnen der Karte den Schlüssel |

Die Größe des Bildes verrät nichts, was das Bild nicht ohnehin zeigt.

## Der Tipp

Auf der Leitung eine Liste von Strichen:

```json
{ "strokes": [ { "brush": 1, "color": "#3049e8", "points": [x0, y0, x1, y1, …] } ] }
```

- `brush` ist ein Index in `params.brushes`, `color` ist `#rrggbb` in Kleinbuchstaben, `points` ein
  flaches Feld ganzer Zahlen, paarweise. Ein Strich mit einem Punkt ist ein Tupfer.
- **Grenzen gegen Missbrauch, keine gegen das Malen:** höchstens 100 000 Punkte und 5 000 Striche
  insgesamt, Koordinaten in `[−10 000, 10 000]`. Eine durchgehende Bewegung, die 66 % füllt, braucht mit
  dem kleinsten Pinsel 2 000–4 000 Punkte; auch ein Gemälde von fünf Minuten bleibt weit darunter.
- Alles andere ist `InvalidGuessException` → 400, **vor** jedem Schreibvorgang: fehlende oder zusätzliche
  Felder, `brush` außerhalb, eine ungültige Farbe, eine ungerade Zahl von Koordinaten, ein leerer Strich,
  Grenzen überschritten. **Ein leeres Gemälde ist gültig** und hat den Anteil 0.
- `judge` rastert die Striche, zählt `cells` und gibt
  `qualifies = tolerance == null || deviation ≤ tolerance`,
  `deviation = |cells − targetCells| / (W × H)`, den Ausgang (unten) und **`guess` neu aufgebaut** aus
  genau den geprüften Feldern. Der Tipp wird an alle anderen veröffentlicht, also darf nichts
  Zusätzliches daneben in die Spalte geraten (wie bei Weltanschauung).

Das Gate rechnet in ganzen Feldern, `|cells − targetCells| ≤ round(tolerance × W × H)`, damit keine
Gleitkomma-Grenze über einen Treffer entscheidet.

Ein flaches Zahlenfeld lohnt keine eigene Kodierung: ein großes Gemälde ist als Upload um 40 KB, und
die Antworten mit den Gemälden aller anderen komprimiert der Rand (`encode zstd gzip` im Caddyfile).

## Rundengeheimnis: die Ausgänge

Jeder Ausgang ist durch einen Feldmengen-Test gepinnt (Jackson 3, `propertyNames()`):

| Ausgang | wann | Felder |
|---|---|---|
| Payload `PaintRatioPayload` | sofort | `width, height, brushes, tolerance` |
| Lösung `PaintRatioSolution` | nach dem eigenen Tipp | `targetRatio, tolerance` |
| Outcome `PaintRatioOutcome` | nach dem eigenen Tipp, für alle | `ratio, difference, withinTolerance` |

- `difference = Anteil − Zielanteil`, **mit Vorzeichen**: zu viel oder zu wenig.
- `withinTolerance` ist `null` in Phase zwei, wie bei Farbausmalung.
- **Keine `shape` im Payload.** Das Bild zeigt die Form; ein Name daneben hilft nichts und kostet einen
  Feldmengen-Test.

## Integrität — die Decke, benannt

**Der Client meldet keinen Anteil, er schickt Striche.** Im Original rechnete der Browser den Anteil
selbst und schickte ihn mit.

**Die Decke: „Lösung liegt im Sichtbaren“**, wie bei Musterung. Ein Skript zählt die Pixel des Bildes
und kennt den Zielanteil exakt; ein zweites erzeugt Striche mit genau diesem Anteil. Dagegen hilft
nichts, was das Spiel nicht zerstört. Die Grenze ist hingenommen.

Ein Screenshot vor dem ersten Strich hebelt „die Vorlage verschwindet“ aus. Das Verschwinden ist eine
Spielregel, kein Schutz, und der Blick zurück per Rückgängig ist ohnehin erlaubt.

## Frontend

```
games/paintratio/
  PaintRatioGame.vue        Ablauf: Brett → Auflösung (keine Hülle)
  PaintRatioBriefing.vue    InfoBox („paint-ratio“) + AwardBox, mit PaintRatioRules.vue
  PaintRatioBoard.vue       Leinwand, Werkzeuge, Signieren, Sperre
  PaintCanvas.vue           zeigt Vorlage oder Striche, nimmt Pointer auf
  strokes.ts                Pointer → Einheiten, Ausdünnen — rein, ohne DOM testbar
  paintHistory.ts           Rückgängig/Wiederholen samt Blick auf die Vorlage — rein
  draft.ts                  Entwurf auf dem Gerät
  render.ts                 Striche auf einen 2D-Kontext — geteilt von Brett, Auflösung, Historie
  PaintRatioReveal.vue      Kopf, Leinwand mit Ebenen, Rangliste
  PaintRatioScoreboard.vue  + scoreboard.ts
  types.ts                  Payload, Lösung, Outcome, Tipp — defensiv eingeengt
```

Dazu `'paint-ratio': PaintRatioGame` in `games/registry.ts` und
`{ id: 'paint-ratio', title: 'Kreativverhältnis' }` in `labGameList`. Das Bild kommt über die
`assets`-Prop und `useSealedAsset`, wie bei den anderen Bildspielen.

### Messen nie aus dem Canvas

Der Canvas ist reine Anzeige. **Kein `getImageData`, kein `toDataURL`** für irgendetwas, das zählt oder
gespeichert wird. Die Wahrheit sind die Striche. Der Backing-Store des Canvas folgt CSS-Größe × DPR,
damit die Striche scharf sind; das berührt nichts, was gezählt wird.

### Brett

Gewählt an Mockups (2026-10-22), von oben nach unten, wie im Original:

1. **Die Leinwand**, kartenbreit wie bei Entstauber und Platzierung, Seitenverhältnis `width : height`,
   weiß. Am Anfang liegt darauf die Vorlage (das PNG), danach die eigenen Striche.
2. **Die Werkzeuge** unter der Leinwand:
   - drei Pinsel als Punkte in der aktuellen Farbe, der gewählte mit Ring;
   - **ein freier Farbwähler** (`<input type="color">`, wie im Original), vorbelegt mit der eigenen
     Spielerfarbe (`useMyColorHex`). Jede Farbe ist erlaubt, auch Weiß, das auf Weiß unsichtbar ist und
     trotzdem zählt (wie im Original);
   - Rückgängig und Wiederholen, ausgegraut, wenn nichts da ist.
3. Die Aufforderung „Male ein Bild mit demselben Farbanteil.“
4. **Der `HoldButton` „Signieren“**, rund, in der aktuellen Farbe, aktiv ab dem ersten Strich.
5. InfoBox und AwardBox.

**`strokes.ts`:**

- Ein Strich beginnt nur mit einem `pointerdown` auf der Leinwand; mit Pointer-Capture darf der Finger
  sie verlassen. Es malt **ein** Pointer zur Zeit, egal ob primär; ein zweiter auf der Leinwand wird
  ignoriert. Liegt der Handballen zuerst auf dem Knopf, ist der malende Finger nicht primär und muss
  trotzdem malen.
- Pointer → Einheiten über das aktuelle Rechteck der Leinwand: `round((clientX − left) / width × W)`,
  ebenso für `y`. Damit ist ein Strich von der Bildschirmgröße und der Pixeldichte unabhängig.
- **Ausdünnen:** ein Punkt, der weniger als 2 Einheiten vom zuletzt behaltenen liegt, fällt weg.
  **Gezeichnet wird genau, was behalten wird**, also genau das, was später geschickt wird. 2 Einheiten
  sind auf dem Telefon unter einem CSS-Pixel.
- Punkte außerhalb von `[−10 000, 10 000]` werden nicht aufgenommen.

**`paintHistory.ts`** hält Striche und Wiederholen-Stapel. Null Striche heißt: die Vorlage ist zu sehen.
Rückgängig nimmt den letzten Strich, Wiederholen bringt ihn zurück, ein neuer Strich leert den
Wiederholen-Stapel. Den Knopf „Signieren“ gibt es ab dem ersten Strich; mit null Strichen zeigt die
Leinwand die Vorlage, und Signieren hieße, die Vorlage abzugeben.

**Entwurf** wie bei Blockierung (`copyblocks/draft.ts`): Striche und Wiederholen-Stapel je Spieler,
Runde und Phase auf dem Gerät, jeder Zugriff abgesichert. Anders als dort taugt der Payload nicht als
Fingerabdruck der Runde — er ist für jede Runde gleich. Der Schlüssel nimmt die Adresse des Werks
(`target`), die die Runde benennt: `?round=` in der echten Runde, Seed und Phase im Labor. Ein vom Telefon verworfener Tab kostet kein
Gemälde. Ein Entwurf mit Strichen zeigt nach dem Neuladen die Malerei, nicht die Vorlage.

**Signieren sperrt** (Clemens' Ansatz gegen den Handballen, gewählt an Mockup „I“):

- Solange der Knopf gehalten wird, **wird die Leinwand grau** und zeigt **in ihrer Mitte einen großen
  Fortschrittsring** mit „Signieren …“. So sieht man das Halten, auch wenn der Handballen den Ring am
  Knopf verdeckt.
- **Berührt ein Finger die Leinwand, bricht das Halten ab.** Während ein Finger malt, startet es nicht.
- Der `HoldButton` gibt dafür seinen Fortschritt nach außen (eine Emission oder ein `v-model`). Das
  Abbrechen läuft über den bestehenden Weg: wird `disabled` wahr, bricht er schon heute ab. Ob das
  Abbrechen beim Malen den Knopf sichtbar ausgraut oder still bleibt, entscheidet der Umsetzer im Labor.
- Die Haltedauer bleibt der Standard (`DEFAULT_HOLD_MS`).

### Auflösung und Historie

Gezeigt werden das Werk und alle Gemälde. Eine abgeschlossene Runde sieht in der Historie genauso aus.

1. **Kopf:** Zielanteil in %, in Phase eins die Toleranz als ±. Eine Nachkommastelle.
2. **Die Leinwand mit Ebenen,** wie `RatioGameResults.vue` im Original: anfangs liegt nur das Werk des
   Kollektivs darauf. **Wer einen Namen antippt, legt dessen Gemälde darüber**; mehrere liegen
   übereinander, in der Reihenfolge des Antippens. Ein zweites Antippen nimmt es wieder herunter. Die
   Zeile „Kollektiv Kommune“ schaltet das Werk selbst.
3. **Die Rangliste**, im Stil der anderen Spiele: **Name · Anteil · Differenz · Pkt**. Die Differenz
   mit Vorzeichen, alles in % mit einer Nachkommastelle. Darunter, abgesetzt, die Zeile „Kollektiv
   Kommune“ mit dem Zielanteil, Differenz 0 und „—“ als Punkte. Sortierung: Betrag der Differenz
   aufsteigend (Komparator des Originals), Aufgegebene zuletzt, `userId` als Tiebreak. Als pure
   `scoreboard.ts`. Wer aufgegeben hat, hat kein Gemälde und ist nicht antippbar.

Die Gemälde zeichnet `render.ts` aus den gespeicherten Strichen, in Farbe und auf jedem Gerät scharf.
Kein Galerie-Modus (das automatische Weiterschalten des Originals entfällt).

**Takt** aus `revealChoreography.ts`: beim Wechsel bleibt das eigene Gemälde stehen; mit
`SOLUTION_DELAY_MS` blendet die Leinwand auf das Werk über und der Kopf erscheint; ab
`RESULTS_DELAY_MS` die Zeilen. Feinabstimmung im Labor.

### Erklärung

`InfoBox` mit Storage-Key `paint-ratio`. Kurztext: „Male ein Bild mit demselben Farbanteil wie das
Kollektiv Kommune.“ Die Regeln darunter, aus dem Original übernommen und gekürzt:

- Wie dein Bild aussieht, spielt keine Rolle. Sei kreativ.
- Gezählt wird, wie viel der Leinwand bemalt ist. Doppelt bemalte Stellen zählen einmal, die Farbe ist
  egal.
- Die Vorlage verschwindet mit deinem ersten Strich. Rückgängig bis zum Anfang zeigt sie wieder.
- Zum Abgeben „Signieren“ gedrückt halten.

Was die Runde zahlt und welche Toleranz gilt, sagt die `AwardBox`. Deutscher Text im UI mit `„…“`.

## Labor

`paint-ratio` / „Kreativverhältnis“ in `labGameList` und `registry`. Der Phasenschalter zeigt beide
Gesichter. Das Bild entsteht über `produceAssets` im Arbeitsspeicher. Der Seed in der URL macht Form und
Werk reproduzierbar. **Einen Formwähler im Labor gibt es nicht:** wer eine bestimmte Form sucht,
probiert Seeds. Hier werden Toleranzen, Dichtebereiche, Freihand und Takte nachgestimmt.

## Tests

**Kotlin**

- **Zählregel:** Tupfer, Strecke, Strecke mit Knick, Vieleck mit Selbstüberschneidung, alles teils
  außerhalb der Leinwand; schneller Rasterer gegen eine Referenzschleife über alle Felder; feste Striche
  → feste Zahlen (das ist der „Ratio Doctor“).
- **Leistung:** ein Tipp an der Obergrenze mit dem größten Pinsel unter einer Sekunde.
- **Zug:** `shape` und `artSeed` variieren nur mit dem Presentation-Seed (Bauform von
  `GuessHueDrawTest`); Formen dieser Edition werden ausgeschlossen, Rückfall auf alle; `tolerance` aus
  der Phase; kein Werk unter der doppelten Toleranz seiner Form, in beiden Phasen; ein Seed, dessen
  erstes Werk zu klein ist, zieht neu und bleibt reproduzierbar.
- **Werke:** jede der zehn Formen zeichnet für eine Handvoll Seeds ohne Fehler; Anteil in `(0, 1)`;
  gleiche Params ergeben dieselben Bytes.
- **Bild:** das PNG dekodiert und gezählt (Alpha ≠ 0) ergibt `targetCells`; ein abweichender Zeichner
  lässt `produceAssets` scheitern.
- **Ausgänge:** Feldmengen-Tests für Payload, Lösung und Outcome.
- **`judge`:** Treffer genau an der Toleranzgrenze; knapp daneben; Phase zwei ohne Gate; leeres Gemälde;
  jede Ungültigkeit aus *Der Tipp* → `InvalidGuessException`; der gespeicherte `guess` enthält keine
  Fremdfelder.
- `LabPointsParityTest` bleibt grün.

**Vitest**

- `strokes.ts`: Abbildung auf Einheiten bei verschiedenen Größen und Pixeldichten; Ausdünnen; ein
  zweiter Pointer malt nicht; ein nicht-primärer Pointer malt.
- `paintHistory.ts`: Rückgängig bis zur Vorlage, Wiederholen, neuer Strich leert Wiederholen.
- `draft.ts`: Speichern, Laden, Fremdrunde, kaputter Speicher.
- Brett: Halten graut die Leinwand und zeigt den Ring; Berühren der Leinwand bricht ab; ein Strich
  während des Haltens ist unmöglich; Halten → ein `guess` mit genau den gezeichneten Strichen.
- Auflösung: Antippen legt Ebenen in Reihenfolge übereinander und nimmt sie wieder ab.
- `scoreboard.ts`: Sortierung, Vorzeichen, Aufgegebene.
- `types.ts`: Einengen von Payload, Lösung, Outcome und Tipp.

## Bewusst verschoben

- **Galerie-Modus** mit automatischem Weiterschalten — gewollt nicht.
- **Formwähler im Labor** — die Seeds reichen fürs Erste.
- **Abspielen, wie ein Gemälde entstand** — die Striche hätten die Reihenfolge, gebaut wird es nicht.
- **Eine Obergrenze für den Zielanteil** — nach oben hat das Original keine gebraucht.

## Folgen für andere Dokumente

- **`frontend.md`** bekommt die Regel „Gemessen wird nie aus einem Canvas“, mit diesem Spiel als Grund.
- **`frontend-ui.md`** oder der `HoldButton`-Kommentar: dass ein Brett das Halten sichtbar machen und
  abbrechen kann, wenn der Knopf verdeckt sein könnte.
