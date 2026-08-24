# Musterung („Find Pattern“) — ein Farbmuster im Gitter finden

**Status:** beschlossenes Design (2026-08-24).

**Baut auf:** dem Runden-Framework ([Round-Game-Selection](2026-08-11-round-game-selection-design.md)),
dem [Spiel-Labor](2026-08-08-game-lab-design.md) und den zwei portierten Spielen als Referenz
([Guess Hue Scoreboard](2026-08-16-guess-hue-scoreboard-design.md),
[Song Snippet](2026-08-20-song-snippet-design.md)).

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — dieses Spiel ist der Fall, für den
jenes Dokument geschrieben wurde („Einstieg: Find Pattern“), und es korrigiert eine seiner
Festlegungen (siehe *Beide Bilder kommen aus dem Server*).

**Berührt:** ein neues Modulith-Modul `findpattern` (rein rechnend, keine Tabelle, keine Migration),
den Adapter `FindPatternGameType` plus vier Eingriffe für die Zeitwertung — drei im Framework
(`PlayService`, `RoundDtos`, `RoundResponses`, dazu `rounds/RoundCard.vue`) und einer im Labor
(`LabDtos`, `LabRoundStore`, `LabService`) — und im Frontend
`games/findpattern/*`, `games/revealChoreography.ts` (hochgezogen aus `guesshue/reveal.ts`),
`ui/InfoBox.vue`, `games/GameEntry.ts`, `api/types.ts`, `games/registry.ts`, `gamelab/games.ts`.

## Zweck & Spielidee

Ein Gitter aus 8 × 14 Blöcken in vier sehr ähnlichen Graustufen. Gesucht ist eine Folge von vier
Blöcken — als Bild darunter gezeigt. Das Gitter wird **wie ein Buch gelesen** (links nach rechts,
Zeile für Zeile), die gesuchte Folge darf also über einen Zeilenumbruch hinweg brechen, und sie kann
mehrfach vorkommen; jedes Vorkommen zählt. Der Reiz ist perzeptuell: die vier Töne liegen so dicht
beieinander, dass das Auge arbeiten muss.

- **Codename:** `find-pattern` (Game-ID), `findpattern` (Modul), `FindPattern*` (Klassen).
- **Anzeigename:** „Musterung“ — das Wortspiel aus *Muster* und *gemustert werden*.

## Die Regeln

**Gitter 8 × 14 = 112 Blöcke, vier Töne (Index 0–3), gesuchte Folge 4 Blöcke lang** — die Maße des
Originals, unverändert. 8 Spalten im Hochformat passen auf ein Telefon, ohne dass ein Block unter die
Tap-Grenze fällt.

**Tippabgabe** (aus dem Original übernommen, weil die Regel gut ist):

1. Irgendeinen Block antippen, der Teil der gesuchten Folge sein soll.
2. Von dort aus weitere **direkte Nachbarn in Leserichtung** (Index ± 1) antippen.
3. Sobald vier Blöcke ausgewählt sind, wird der Tipp **sofort** abgegeben.
4. Neu anfangen geht, indem man einen bereits gewählten Block oder einen Nicht-Nachbarn antippt.

Es gibt genau einen Tipp pro Spieler und Runde — das ist die Regel des Frameworks, nicht die des
Spiels.

**Die Phasen sind verschieden, und nur darin unterscheidet sich diese Runde von jeder anderen:**

| | Phase eins | Phase zwei |
|---|---|---|
| Aufdecken | nein, Board ist sofort da | **ja, genau einmal** |
| Zeit | läuft nicht ins Ergebnis ein | entscheidet |
| Award | `ALL_QUALIFYING` — jeder Treffer 1 Punkt | `CLOSEST_ONLY` — **der schnellste** Treffer nimmt alles |

Das ist die Dramaturgie des Originals (`blocksAreHidden = isLive`, `drawLiveInstructions()`): in
Phase eins darf man sich beliebig lange umsehen, in Phase zwei ist es „Winner Takes It All“ — man
muss das Muster finden *und* der schnellste sein.

Im Vertrag heißt das `requiresReveal(params) = params.timed`, und `timed` setzt der Zug aus der
Phase — dieselbe Bauform wie Guess Hues `toleranceDeg`, das die Phase ebenfalls in den Params trägt,
statt sie erneut zu erfragen.

## Beide Bilder kommen aus dem Server

Der Client bekommt **keinen einzigen Farbwert** vor der Auflösung. Spielfeld *und* Suchmuster sind
server-gerenderte PNGs; alles, was der Client sonst hat, sind `cols`, `rows` und `patternLength`. Die
Auswahl läuft über Block-Indizes, die Markierung in der Farbe des Spielers.

Das **korrigiert** die Anti-Cheat-Spec, die an dieser Stelle noch „das Gitter *muss* als Daten kommen
(Interaktion, Animation), das Suchmuster nicht“ festhält. Diese Begründung ist mit der neuen
Tippmarkierung entfallen: das Original brauchte die Farbe jedes Blocks, um ihn beim Hovern
abzudunkeln — eine Outline in Spielerfarbe braucht sie nicht. Und mobil gibt es kein Hover, das etwas
tragen könnte. Damit fällt die letzte Zuständigkeit weg, für die der Client Farben halten musste, und
die Messlatte der Spec („die Lösung darf nicht übertragen werden und nicht in einer JS-Variablen
stehen“) wird nicht nur für die Lösung, sondern für die gesamte Darstellung erreicht.

**Die dokumentierte Obergrenze bleibt:** wer ein Skript schreibt, das das Board-PNG auf ein Canvas
legt, die Zellmitten ausliest und die Töne clustert, findet das Muster danach trivial. Das ist die
Kategorie „Lösung liegt im Sichtbaren“ und war schon in der Anti-Cheat-Spec als Obergrenze benannt.
Was der Port gewinnt, ist der Sprung von „drei Zeilen Konsole“ auf „eine Bildverarbeitung
schreiben“ — plus die Uhr in Phase zwei, die genau diesen Aufwand bestraft.

**Auslieferung im Payload, nicht über den Asset-Endpoint.** Die beiden PNGs reisen als
`data:image/png;base64` im Payload. Begründung:

- Der Asset-Endpoint (`/rounds/{n}/assets/{key}`) staffelt Schlüssel nach Stufe: vor dem Guess ist
  `key in 0..stage` erlaubt, für ein einstufiges Spiel also **genau ein** Bild. Zwei Bilder hätten
  eine Erweiterung des Gates gekostet — ein neuer Sichtbarkeits-Begriff im Framework für zwei
  Kilobyte.
- Der Endpoint existiert für Song Snippets Megabyte-Audio, das teuer zu beschaffen ist (Netz-I/O) und
  darum gespeichert werden muss. Hier ist beides nicht so: die Bilder sind winzig und entstehen in
  Mikrosekunden aus den Params. Kein `produceAssets`, kein `materialised`, keine Tabelle, keine
  Migration, keine Release-Hooks — und die History rendert alte Runden weiter, ohne dass ein Byte
  gespeichert wäre.
- Anti-Cheat-neutral: ein Data-URI ist für ein Skript genauso ein Canvas-Aufruf wie eine URL.

**Gerendert wird in `present()`, nicht im Zug.** Die Alternative — die Bilder in `params` einfrieren —
würde eine Runde auch gegen späteres Ändern der Renderkonstanten immun machen. Bewusst nicht gewählt:
`params` soll das Rundengeheimnis tragen, nicht dessen Darstellung. Der Preis ist benannt: ändern wir
später die Blockgröße, sieht eine alte Runde in der History anders aus als damals. Kosmetik, keine
Fairness.

## Der Zug

```kotlin
data class FindPatternParams(
    val blocks: List<Int>,        // 112 Werte 0..3 — presentation
    val patternStartIndex: Int,   // 0..108 — solution
    val delta: Double,            // presentation
    val timed: Boolean,           // aus der Phase
)
```

**Die Stromtrennung ist hier subtiler als bei den anderen Spielen** und darum ausgeschrieben: Das
Gitter *wird gezeigt*, also kommt es aus `presentation` — samt `delta`, das man am Bild ablesen kann.
Der Startindex ist die Lösung und kommt aus `solution`. Das Suchmuster-Bild ist damit eine Funktion
eines Zugs aus dem Solution-Strom — erlaubt, weil die Regel den **Strom** schützt, nicht den Wert:
veröffentlicht wird kein roher Wert aus diesem Strom (aus dem sich der Zustand rückwärts rechnen
ließe), sondern nur die vier Farben an dieser Stelle. Die engen den Index auf „alle passenden
Stellen“ ein — und genau das *ist* die Aufgabe.

Der Clamp des Originals (`if (candidate > 108) candidate = 108`, was die letzte Position häufiger
macht als jede andere) fällt weg: gezogen wird direkt in `0..108`.

**`delta` ist ein Zufallswert in `[0,10 … 0,20]`.** Die drei kalibrierten Erfahrungswerte —
0,2 leicht · 0,12 mittel · 0,1 schwer — stehen als Kommentar neben dem Zug, damit sie nicht verloren
gehen, ohne die Auswahl in Stufen zu zerlegen.

`RoundContext.previousParams` bleibt ungenutzt: zwei zufällige 112-Block-Gitter kollidieren nicht.

## Palette: chroma-js nachgebaut

Der Grauton-Modus des Originals (`useFindPatternGameColor`, Zweig `distance <= 1`):

1. Ein Referenzpunkt `ref` in `[0,1]`, so eingeklemmt, dass `ref ± delta/2` im Intervall bleibt.
2. Start- und Endton sind die Graustufen an `ref − delta/2` und `ref + delta/2` auf der
   Weiß→Schwarz-Rampe (`chroma.scale()`, RGB-linear).
3. Die vier Töne sind vier gleichmäßige Schritte dazwischen, **in LCH interpoliert** — bei Graustufen
   heißt das: gleichmäßig in L\*, nicht in RGB.

Das wird in Kotlin nachgebaut statt neu erfunden, damit die kalibrierten Delta-Werte ihre Bedeutung
behalten. Für Graustufen reduziert sich der Weg auf sRGB → L\* → sRGB (Gamma-Linearisierung,
`cbrt`); rund 20 Zeilen ohne Farbraumbibliothek. `presentation` liefert `ref`. Die Werte werden
einmalig mit chroma-js aus dem Referenzprojekt erzeugt und als Golden Values in einem Kotlin-Test
festgenagelt.

Kein Fall für [cross-runtime-parity](../../../.claude/guidelines/cross-runtime-parity.md): die Palette
rechnet nur auf der JVM, der Client bekommt Hex-Strings. `pow`/`cbrt` sind hier deshalb erlaubt.

## Bilder

`java.awt.image.BufferedImage` + `ImageIO`, headless (Spring Boots Standard). Board bei 24 px pro
Block = 192 × 336, vier Flächen — als PNG einige hundert Byte, base64 unter 1 KB. Muster: 4 × 1
Blöcke. Der Rahmen bleibt CSS, nicht Bild.

Skaliert wird im Browser über die Breite mit `image-rendering: pixelated`, damit Blockkanten hart
bleiben; das Overlay-Gitter skaliert mit derselben Breite mit, sodass Bild und Zellen nicht
auseinanderlaufen können.

## Rundengeheimnis: die zwei Ausgänge

**Payload** (`present`) — fünf Felder, gepinnt durch einen Feldset-Test:

```
cols, rows, patternLength, boardImage, patternImage
```

**Solution** (`solution`, erst nach dem eigenen Guess) — ebenfalls gepinnt:

```
blocks (112 Indizes), pattern (4 Indizes), palette (4 Hex), delta, startIndices (alle Treffer)
```

`blocks` und `palette` sind es, die im Reveal die Tipp-Chips, die Lösungs-Chips, die Palette und die
Zahl-im-Block-Inspektion tragen. `startIndices` sind die „Möglichkeiten“ — im Original clientseitig
gesucht, jetzt serverseitig.

**Outcome:** `{ correct: Boolean }`. Es geht nach dem eigenen Guess für alle anderen mit raus, trägt
aber nichts, woraus sich die Lösung rekonstruieren ließe, was es nicht ohnehin schon täte: der Tipp
selbst und die Lösung sind zu diesem Zeitpunkt beide sichtbar.

**Guess auf der Leitung:** `{ startIndex: Int }`. Gültig ist `0..108`, alles andere ist
`InvalidGuessException` → 400, **vor** jedem Schreibvorgang, sodass ein kaputter Request den einen
Versuch nicht verbraucht. Der Client erzwingt Zusammenhang und Länge, also genügt der Startindex.

## Zeit: vier Eingriffe ins Framework

Dies ist das erste zeitgewertete Spiel. Was dafür gebaut wird, gehört dem Framework, nicht dem Spiel:

**1. `deviation` ist die Dauer, wenn das Spiel ein Aufdecken verlangt.** In `PlayService.guess`
(und wortgleich in `LabService.guess`) steht heute schon eine Überschreibung: für ein stufiges Spiel
*ist* die Distanz die Stufe. Daneben tritt: für ein Spiel mit `requiresReveal` ist sie
`guessedAt − revealedAt` in Millisekunden. Damit zahlt `CLOSEST_ONLY` in Phase zwei genau „korrekt
**und** schnellster“, ohne dass das Spiel die Uhr kennen müsste — die Uhr gehört dem Server, und ein
`judge(params, guess)` hat keinen Zugang zu ihr, absichtlich. Für Guess Hue und Anspielung
(`requiresReveal = false`) ändert sich nichts.

**2. `durationMs` wird veröffentlicht — genau dort, wo sie Ergebnis ist.** Neu auf `MyPlayDto`,
`OtherPlayDto`, `LabEntryDto` und (TS) `GameEntry`; nicht-null genau dann, wenn das Spiel ein
Aufdecken verlangt *und* die Zeile fertig ist.

Das justiert eine Regel aus [game-rounds.md](../../../.claude/guidelines/game-rounds.md): „*wann* sie
aufgedeckt und *wann* sie geraten haben, sagt, wie lange jeder von ihnen darauf gesessen hat, und das
ist zwischen ihnen und dem Server“. Die Begründung trägt weiter, aber sie trennt jetzt an der
richtigen Kante: bei einem zeitgewerteten Spiel **ist** die Dauer das Ergebnis der Runde, und „was
die anderen gespielt haben und was es gebracht hat, ist die Runde, und das bekommen sie“. Ohne die
Spalte wäre in Phase zwei nicht belegbar, warum der Gewinner gewonnen hat.

Es ist **kein neuer Schalter** — die Bedingung ist der bestehende `requiresReveal`, und der ist genau
der Schalter, dessen Antworten sich laut Guideline zwischen Spielen wirklich unterscheiden. Die
Zeitstempel selbst bleiben, was sie sind: die eigenen in `MyPlayDto`, die der anderen nirgends. In
Phase eins verlangt Musterung kein Aufdecken, also gibt es dort keine `durationMs`, keine
[mm:ss]-Spalte und keine Wertung auf Zeit — `revealed_at` heißt da nur „die Karte war da“.

**3. Das `sealed`-Face sagt, was der Klick kostet.** `RoundCard` zeigt heute einen nackten Knopf
„Aufdecken“. Dazu kommt der Text: die Uhr startet mit dem Klick, und es gibt genau einen Versuch.
Kein neuer Schalter — `sealed` *heißt* schon `requiresReveal`, also gilt der Satz für jedes Spiel,
das dieses Face je zeigt. Das Original hat diese Warnung ins Canvas gemalt
(`drawLiveInstructions()`); im Port ist sie framework-eigen, weil sie eine Aussage über die
Mechanik ist und nicht über Musterung.

**4. Das Labor bekommt eine Uhr.** `LabRoundStore` stempelt beim ersten `open` pro (Runde, Tester)
und leitet daraus die `durationMs` des Eintrags ab. Ohne das wäre die [mm:ss]-Spalte im Labor leer,
also gerade in dem Werkzeug nicht zu beurteilen, das für die Beurteilung gebaut wurde. Das Labor
zeigt weiterhin kein `sealed`-Face — das ist Framework-UI, keine Spiel-UI, und kostet die Review
nichts.

**Was ersatzlos entfällt:** die Client-Zeitstempel des Originals (`gameStartedAt`/`gameStoppedAt` im
Guess), der Drift-Abgleich, `suspicion` samt „🤨🤨“-Anzeige und der Bann bei zweitem Aufdecken. Der
Server stempelt selbst, also gibt es nichts abzugleichen, und „genau einmal aufdecken“ ist das
`INSERT … ON CONFLICT DO NOTHING` in `revealOnce` — null betroffene Zeilen sind der 409, kein
gefälschter Guess in der Datenbank.

## Frontend

### Ein Gitter, zwei Nutzer

`PatternGrid.vue` trägt das Board-Bild plus ein transparentes CSS-Grid-Overlay und eine Liste von
Markierungen. Drei Arten, alle über Zellindex adressiert:

- **Outline** — ein Rahmen in einer Spielerfarbe, mit Einrückung (`inset`), damit sich mehrere
  stapeln lassen.
- **Dot** — ein Punkt in der Zellmitte.
- **Zahl** — der Farbindex der Zelle.

Board und Reveal sind damit dieselbe Darstellung. Das ist der Grund, warum die Tippmarkierung schon
beim Spielen eine Outline ist und kein weißer Ring wie im Original: was man beim Raten gesehen hat,
steht im Reveal an derselben Stelle in derselben Form.

### Board

Bild mit Overlay, darunter „Finde das folgende Muster im Spielfeld“ und das Muster-Bild. Die
Auswahlregeln (siehe *Die Regeln*) leben als pure `selection.ts`, damit sie ohne DOM testbar sind —
happy-dom rechnet kein Layout, und die Regel ist reine Index-Arithmetik. Die eigene Farbe kommt aus
`entries`, nicht aus einer neuen Prop.

Die vierte Regel („neu anfangen“) ist bewusst die des Originals: keine Löcher in der Auswahl, kein
einzelnes Abwählen. Wer daneben tippt, fängt neu an — auf einem Telefon die verzeihendere Variante.

### Die Beschreibung als angedockte Card

Der Beschreibungsblock des Originals (`GameDescription`) wird übernommen, weil er gut ist, und
frischer gesetzt: eine eigene Card, sichtbar abgesetzt vom Spielfeld, mobil darunter, ab einem
mittleren Breakpoint rechts daneben. Mechanik und Inhalt trennen: `ui/InfoBox.vue` klappt ein und
aus und merkt sich das in `localStorage`; der Text kommt komplett per Slot. An der Klapp- und
Merk-Logik ist nichts spielspezifisch.

Das Layout wird im Labor ausprobiert — zwei bis drei Varianten, mobil und Desktop, Entscheidung am
Bild.

### Reveal

Dasselbe Gitter, jetzt mit:

- **allen Tipps als Outlines** — der eigene ganz außen (Einrückung 0), fremde je Kollision 2 px nach
  innen. Außen liegt der eigene, damit er dort liegt, wo er beim Spielen lag; das Original hatte die
  Reihenfolge der Datenbank.
- **den Möglichkeiten als Dots** — vier pro Möglichkeit, je einer zentriert im Kästchen. Überlappen
  zwei Möglichkeiten, ist es ein Dot für beide (die Indizes sind eine Menge); der Lauf wird dann
  sichtbar länger als vier, was der Wahrheit entspricht. Der Dot ist nicht bunt (dunkel mit hellem
  Ring), damit „farbig“ weiterhin „ein Spieler“ heißt.
- **der Zahl-Inspektion** — Tap auf ein Kästchen schaltet seinen Farbindex ein und aus. Damit lässt
  sich nachträglich prüfen, ob eine andere Stelle die Lösung gewesen wäre. Aus dem Original
  (`writeAtIndex`), das der Nutzer als fehlend gemeldet hat.

Das Muster-Bild fällt im Reveal weg: die vier Lösungs-Chips über der Tabelle zeigen dasselbe, und
zusätzlich ihren Farbindex.

Daneben (nicht darunter, wie im Original) die **Palette**: vier Kreise mit ihrem Index und darunter
Δ. Das `°` des Originals fällt weg — es war Erbe des Hue-Modus, ein Grau-Abstand ist kein Winkel.

**Der Farbindex ist die verbindende Zahl** und deshalb an vier Stellen dieselbe: im Board (nach Tap),
in der Palette, in der Lösungs-Zeile des Scoreboards und in jeder Tipp-Zelle.

### Scoreboard

Echte Tabelle im Stil von `GuessHueScoreboard` (dunkles Kopfband, weiße Gutter, Ink-Entscheidung pro
Zelle), darüber die vier Lösungs-Chips. Spalten: **Name · Tipp · [mm:ss] · Pkt** — die
`(x,y)`-Spalte des Originals und die zugehörige Sternchen-Zeile fallen weg, und [mm:ss] erscheint nur
in Phase zwei, weil es nur dort eine Dauer gibt.

Sortierung (die des Originals, ohne den Bann):

1. Punkte absteigend (`null` zuletzt),
2. Treffer vor Nicht-Treffern,
3. Dauer aufsteigend, wo vorhanden,
4. `userId` als Tiebreak, damit ein Reload dasselbe Bild zeigt.

Als pure `scoreboard.ts`, wie bei Guess Hue.

### Choreographie — hochgezogen, nicht kopiert

Die Beats und die Kaskaden-Arithmetik liegen heute in `games/guesshue/reveal.ts`, sind aber nichts
Hue-spezifisches. Sie ziehen nach `games/revealChoreography.ts`: `FADE_MS`, `SOLUTION_DELAY_MS`
(heute `SECTOR_DELAY_MS`), `RESULTS_DELAY_MS`, `HEAD_DELAY_MS`, `CELL_STAGGER_MS`, `ROW_STAGGER_MS`,
`TYPE_BUDGET_MS`, `TIP_COLUMN`, `rowStagger`, `headCellDelayMs`, `cellDelayMs`, `tickOfRow`.
Hue-eigenes (Lanes, Sektorpfade, `circularDistance`) bleibt, wo es ist. Guess Hue stellt um; seine
Tests bleiben unverändert grün. Kopieren wäre der zweite Zeitplan, der irgendwann auseinanderläuft.

Musterungs Reveal fährt damit dieselben Stufen:

1. **Wechsel** — der eigene Tipp bleibt stehen. Er steht auf demselben Bild an derselben Stelle, also
   ist „stehenbleiben“ hier keine Animation, sondern die Abwesenheit einer.
2. **~900 ms** — die Möglichkeiten-Dots, der Tabellenkopf mit den Lösungs-Chips und die Palette.
3. **ab ~1900 ms** — die fremden Tipps, jeder gekoppelt an seine Tabellenzeile über dieselbe
   `cellDelayMs` und die Tipp-Spalte. Ein Zeitplan, keine zwei.

Die eigene Zeile borgt sich weiter das Timing der ersten fremden (`tickOfRow`), damit die eigene
Platzierung nicht schon durch ihren Slot verraten wird, bevor ein fremder Tipp zu sehen war.

## Labor

`labGameList` und `registry` bekommen `find-pattern` / „Musterung“. Der Phasenschalter des Labors ist
für dieses Spiel besonders wichtig, weil die beiden Phasen sich hier stärker unterscheiden als bei
allen anderen: Phase eins zeigt das Board sofort, Phase zwei wertet die Uhr. Der Seed steht wie immer
in der URL — für dieses Spiel heißt das, dass im Labor sowohl Gitter als auch Lösung reproduzierbar
sind; das ist die bekannte, bewusste Grenze des Labors.

## Tests

**Kotlin**

- Zug: `blocks`/`delta` variieren nur mit dem Presentation-Seed, `patternStartIndex` nur mit dem
  Solution-Seed (die Bauform von `GuessHueDrawTest`).
- Feldset-Test für Payload und Solution (Jackson 3: `propertyNames()`).
- `judge`: Treffer, Nicht-Treffer, mehrere Möglichkeiten (jede zählt), Grenzen `0` und `108`, sowie
  `109`, `-1` und fehlendes/nicht-numerisches Feld → `InvalidGuessException`.
- Palette gegen chroma-js-Golden-Values; `delta` an beiden Rändern des Intervalls.
- Bild: PNG-Signatur, Maße, Pixelprobe an einer Zellmitte gegen die Palette.
- `PlayService`: `deviation` ist die Dauer, wenn `requiresReveal`; unverändert bei den anderen
  Spielen; `CLOSEST_ONLY` zahlt dem Schnellsten unter den Treffern.
- `LabPointsParityTest` bleibt grün.

**Vitest**

- `selection.ts`: alle vier Auswahlregeln, Loch-Erkennung, Auto-Abgabe bei vier.
- `scoreboard.ts`: Sortierung in beiden Phasen, `durationMs`-Formatierung (mm:ss, Minuten laufen
  über 59 hinaus), fehlende Werte.
- `PatternGrid`: die drei Markierungsarten, Zellindex → Position.
- Board: Tap-Folge → ein `guess`-Emit mit dem richtigen `startIndex`.
- Reveal: Outlines gestapelt, Dots pro Möglichkeit, Zahl-Toggle, Palette.
- `InfoBox`: Klappen und Persistenz.
- `revealChoreography`: die hochgezogenen Funktionen, mit den Assertions aus Guess Hues Tests.

## Bewusst verschoben

- **Anomalie-Erkennung** (unrealistisch schnelle Lösung → sichtbares Signal). Die Anti-Cheat-Spec
  nennt es als weiches Signal für später; bei ~15 Mitspielern ist die Statistik dünn, und ein
  Schwellwert ohne Daten wäre geraten. Die Uhr allein ist die Verteidigung, die dieses Spiel braucht.
- **Rauschen im Bild** gegen Pixel-Extraktion. Wirkungslos gegen Clustering und teuer im
  Spielgefühl — die Obergrenze bleibt dokumentiert statt kosmetisch verteidigt.
- **Delta über die Rundennummer rampen.** Bräuchte das Spielfenster in `RoundContext`; die
  Zufallsauswahl reicht.
