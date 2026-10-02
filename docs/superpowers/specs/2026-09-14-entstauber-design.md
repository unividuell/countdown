# Entstauber — das Reaktionsspiel aus `huettehuette`, im Runden-Framework

**Status:** beschlossenes Design (2026-09-14), auf die Hülle umgestellt (2026-09-29).

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md) (`GameType`,
`GameRandom`, `awardFor`/`pointsFor`), dem [Bild-Pool](2026-09-07-community-image-pool-design.md) —
dessen erster Abnehmer dies ist —, dem [Runden-Frontend](2026-08-14-round-frontend-design.md), der
[Spieluhr im Band](2026-09-11-game-stopwatch-design.md) und der
[Hülle](2026-09-25-reveal-cover-design.md) (`scene`, `RevealCover`, Halten ist Einzählen).

**Steht neben:** [Musterung](2026-08-24-musterung-design.md), dem Spiel, das die
Integritätsregeln validiert hat. Entstauber ist der erste Fall, der eine davon nicht einhalten kann,
und benennt das.

**Berührt:** ein neues Modulith-Modul `deduster` (ein Schema, eine Tabelle), den Adapter in
`game.internal`, eine erste exportierte API aus `imagepool`, fünf kleine Erweiterungen am
gemeinsamen Vertrag (`RoundContext.communityId`, `isAvailable`, `scoresOnDuration`, ein dritter
Strom in `GameRandom`, `SCENE_ASSET_KEY`), und im Frontend ein neues Spielverzeichnis samt
Registry-Eintrag, dazu je ein Prop an `HoldButton` (`beatMs`) und `RevealCover` (`timed`, `note`).

## Zweck

„Entstauber“ war im Original das beliebteste Spiel: das mit dem meisten Nervenkitzel, der meisten
Diskussion danach und der regesten Beteiligung. Diese Portierung übernimmt die **Spielidee**, nicht
den Code.

Ein Foto liegt unter einer Staubschicht. Im festen Takt wird eine Kachel nach der anderen
entstaubt; jede muss bestätigt werden, bevor die nächste fällt. Wer bis zum Schluss mithält,
gewinnt. Gemessen wird dabei die Reaktionszeit je Kachel — und die entscheidet in Phase zwei, wer
die Punkte behält.

Das Bild kommt aus dem Bild-Pool: **vorrangig aus dem Bestand der Gemeinschaft**, der globale
Bestand ist nur der Rückfall.

## Abgrenzung — was ausdrücklich nicht gebaut wird

- **Keine Fremdpakete.** Nicht `echarts` (die Auswertungskurve entsteht als inline-SVG), nicht
  `vue-touch-ripple` (der Ripple sind zwanzig Zeilen), nicht `seedrandom` (`SeededRandom` kann alles
  Nötige).
- **Kein Admin-Regler.** Das Original ließ einen Spielleiter Takt, Spalten, Zeilen und Bild pro
  Runde setzen. Hier wird gezogen; die Ziehung ist der Regler.
- **Keine Spur im Original-Format.** `DedusterTrace` transportierte pro Kachel vier Werte, aus denen
  der Server zwei Zahlen errechnete. Übertragen werden die zwei Zahlen.
- **Keine Roundtrips pro Kachel** und damit kein SSE, kein WebSocket, kein Pre-Commit-Verfahren.
  Begründung unter „Integrität“.
- **Kein Spielleiter-Knopf gegen eine Markierung.** `override` hängt heute an `allowsPeerReview`;
  das aufzuspalten wäre eine zweite Framework-Änderung in derselben Sache. Ein markierter Lauf wird
  per SQL von Hand behandelt.
- **Kein Parität-Vektor in `shared/`.** Das Original rechnete die Kachelreihenfolge in Browser *und*
  Server aus demselben Seed. Hier zieht nur der Server und veröffentlicht das Ergebnis — es gibt
  nichts, was in zwei Laufzeiten gleich rechnen müsste.

## Die Regeln

Wörtlich die des Originals:

1. In einem pro Runde festen Takt wird eine Kachel nach der anderen entstaubt.
2. Jede neu entstaubte Kachel muss bestätigt werden — ein Tipp auf genau diese Kachel.
3. Zeit dafür ist bis zur nächsten Kachel, also ein Takt.
4. Wer bis zum Schluss mithält, gewinnt.
5. Verloren hat, wer a) nicht rechtzeitig bestätigt oder b) eine andere als die zuletzt entstaubte
   Kachel antippt.

Mehrfach auf dieselbe heiße Kachel zu tippen ist erlaubt und beendet nichts („CS rifle shot“ im
Original) — gewertet wird der erste Treffer.

## Was sich gegenüber dem Original ändert — und warum

| Original | hier | Grund |
|---|---|---|
| Kachelreihenfolge aus `seedrandom(round)` im Browser | serverseitig gezogen, im Payload veröffentlicht | im Original konnte jeder Client sie nachrechnen; hier ist sie wenigstens ein Serverwert |
| Spur mit vier Feldern pro Kachel, serverseitig nachgerechnet | `reactionsMs` + `endedBy` + `wrongTileIndex` | der Server kennt die Reihenfolge selbst; alles Übrige war Redundanz |
| Unplausible Spur → HTTP 400 | Markierung, nie Abweisung | ein Lauf ist nicht wiederholbar; ein Fehlalarm dürfte ihn nicht kosten |
| START-Knopf in der Karte | das Halten auf der Hülle ist Aufdecken, Einzählen und Start in einem | nur so ist „ein Aufdecken = ein Lauf“ überhaupt beobachtbar |
| 8×6 auf 4:3, vom Admin gesetzt | 48 Kacheln, Raster folgt der Orientierung des Bildes | der Pool wird von Handykameras gefüttert, Hochformat ist der Normalfall |
| Takt vom Admin gesetzt | gezogen aus der Verteilung der 35 Originalrunden | es gibt keinen Admin mehr, und geraten wäre schlechter als abgeschrieben |
| „scroll lock“-Häkchen | automatisch während des Laufs | niemand soll etwas einstellen müssen |
| Auswertungskurve mit `echarts` | dieselbe Kurve als inline-SVG | die Kurve war der Ort der Diskussion; das Paket war es nicht |

## Modulschnitt

Neues Modulith-Modul `deduster` (Schema gleichen Namens, Migration unter `db/migration/deduster/`),
Adapter `DedusterGameType` in `game.internal` — das Muster von `findpattern` und `songsnippet`.

```
game ──▶ deduster ──▶ imagepool ──▶ community, iam
```

`deduster` trägt: `DedusterGrid` (Orientierung → Spalten/Zeilen/Zielverhältnis), `DedusterTicks`
(die Taktverteilung), `DedusterImages` (Zuschnitt und Skalierung), `DedusterPool` (Vorrang
Gemeinschaft vor global, `gridOf`), `RoundImageStore` (die Tabelle). Der Adapter trägt Params,
Payload, Urteil — nichts davon kennt `deduster`, und er sieht `imagepool` nicht.

### `imagepool` exportiert zum ersten Mal etwas

Die Pool-Spec hat das Modul bewusst ohne API gelassen: „Das erste Bildspiel bringt die Schnittstelle
mit, weil es dann weiß, was es braucht.“ Es braucht drei Methoden.

```kotlin
package org.unividuell.countdown.core.imagepool

/** Die Maße, wie das Bild *angezeigt* wird — EXIF-Orientierung bereits angewandt. */
data class ImageSize(val width: Int, val height: Int)

interface ImagePoolQuery {
    /** `null` adressiert den globalen Bestand — dieselbe Form wie `IS NOT DISTINCT FROM` im Repository. */
    fun candidateIds(communityId: UUID?): List<UUID>
    fun displaySize(id: UUID): ImageSize?
    fun displayed(id: UUID, minShortEdge: Int): BufferedImage?
}
```

**Warum `candidateIds` nur Ids liefert und die Maße einzeln kommen:** die Spalten `width`/`height`
der Pool-Tabelle stammen aus dem Dateikopf (`ImageIO.getWidth`/`getHeight`) und sind bei einem
Handyfoto mit EXIF-Orientierung **vertauscht**. Dem Pool ist das nie aufgefallen, weil seine Liste
Thumbnails zeigt, in denen die Orientierung angewandt ist. Für dieses Spiel entscheiden die Maße
über das Raster, also müssen sie die angezeigten sein. `displaySize` liest dafür genau ein Bild —
einmal pro Runde, beim Ankündigen —, dessen Kopf und dessen EXIF-Tag. Der Bestand als Ganzes wird
nie dekodiert.

**Warum `displayed` ein Bild liefert und keine Bytes:** die EXIF-Drehung lebt in `ImageIntake`, und
Modulith verbietet dem Spiel den Zugriff darauf. Der Pool gibt das Bild deshalb schon gedreht heraus,
nur so klein dekodiert, wie `minShortEdge` es erlaubt.

Die **Vorrangregel lebt im Spiel, nicht im Pool**: `candidateIds(community) ifEmpty
{ candidateIds(null) }`. Der Pool lernt kein Spielwissen; das hat er sich in seiner eigenen Spec
verbeten.

### `RoundContext` bekommt die Gemeinschaft

```kotlin
data class RoundContext(
    val communityId: UUID,
    val roundNumber: Int,
    val phase: Phase,
    val previousParams: List<JsonNode> = emptyList(),
)
```

Ohne sie kann keine Ziehung einen Community-Pool sehen. `AnnouncementService.materialise` hat die
Id ohnehin zur Hand; `LabService.chooseRound` ebenfalls, es reicht sie heute nur nicht durch.

### `GameType.isAvailable`

```kotlin
/**
 * Ob dieses Spiel für diese Runde überhaupt ziehen kann. Vorgabe `true` — und hier ist die Vorgabe
 * die sichere Richtung, weil ein Spiel, das nichts sagt, sich nicht selbst abschaltet.
 *
 * `GameSelection` zieht aus der gefilterten Liste; ein Spiel ohne Inhalt taucht gar nicht erst auf.
 */
fun isAvailable(context: RoundContext): Boolean = true
```

Entstauber antwortet `false`, solange die Gemeinschaft weder eigene noch globale Bilder hat.
Lokal und auf Staging ist das laut Pool-Spec der Normalzustand: der globale Bestand entsteht nur
dadurch, dass ein Super-Admin ihn hochlädt, und es gibt keinen Seed im Repo.

`AnnouncementService.materialise` filtert `catalog.ids()` damit, **bevor** `selection.pick` zieht.

### `GameRandom` bekommt einen dritten Strom

Entstaubers Bühne braucht gezogene Werte — Bild und Takt —, und `game-rounds.md` verbietet einer
Bühne beide vorhandenen Ströme: aus `presentation` ließe sich der noch versiegelte Payload
zurückrechnen, hier also die Kachelreihenfolge. Die Regel nennt den Ausweg selbst, einen dritten,
unabhängig geseedeten Strom:

```kotlin
class GameRandom(val solution: SeededRandom, val presentation: SeededRandom, val scene: SeededRandom)
```

| Strom | darf veröffentlicht werden | Entstauber zieht |
|---|---|---|
| `scene` | vor dem Aufdecken | Bild, Takt |
| `presentation` | ab dem Aufdecken | Kachelreihenfolge |
| `solution` | nie | nichts |

`independent` zieht einen dritten Seed aus derselben `SecureRandom`; `fromSeed` leitet ihn wie
`presentation` über ein eigenes Salz ab, ein Seed in der Labor-URL reproduziert also weiter die
ganze Runde. Die übrigen Spiele ziehen nie aus `scene` und merken nichts.

### Ein Asset vor dem Aufdecken

```kotlin
/** Das Asset der Bühne: erreichbar, sobald die Runde angekündigt ist — ohne Play-Zeile. */
const val SCENE_ASSET_KEY = 98
```

Das Gegenstück zu `SOLUTION_ASSET_KEY`. `PlayService.asset` prüft den Schlüssel **vor** der
Play-Zeile, die es heute für jedes Asset verlangt (`NotRevealedException`); `LabService.asset`
nimmt ihn in dieselbe `allowed`-Zeile. Jeder andere Schlüssel bleibt hinter `key in 0..stage`.

Stufe 0 vor dem Aufdecken freizugeben wäre der falsche Schnitt: bei Anspielung ist sie der erste
Schnipsel, also das Rätsel. Ein Spiel ohne Bühnen-Asset liefert für `98` `null`, der Client bekommt
404.

## Die Runde

```kotlin
data class DedusterParams(
    /** Weiche Referenz in den Pool. Nach dem Einfrieren nur noch Herkunftsnachweis. */
    val imageId: UUID,
    val cols: Int,
    val rows: Int,
    val intervalMs: Int,
    /** Die Entstaub-Reihenfolge: eine Permutation von `0 until cols * rows`. */
    val order: List<Int>,
)
```

**Gezogen wird nach Veröffentlichung:** Bild, dann Takt aus `random.scene` — beide liegen vor dem
Aufdecken beim Client —, die Kachelreihenfolge aus `random.presentation`, denn sie kommt erst mit
dem Payload. `random.solution` bleibt unberührt — und das ist eine Aussage, kein Versehen:
Entstauber hat kein Geheimnis. Bild, Raster, Takt und Reihenfolge sieht der Spieler ohnehin; es gibt
keinen Wert, aus dem sich etwas erschließen ließe, was nicht auf dem Bildschirm steht. Ein Kommentar
an der Ziehung sagt das, damit niemand die fehlende Solution-Ziehung später „repariert“.

Versiegelt ist nur die Reihenfolge, und nur bis zum Aufdecken: wer sie vorher kennte, könnte sie
auswendig lernen, bevor irgendetwas zählt.

Die Bildwahl schließt aus, was diese Edition schon hatte: `context.previousParams` liefert die
früheren Entstauber-Params, deren `imageId` fallen aus der Kandidatenliste. Bleibt nichts übrig,
zählt wieder die volle Liste — ein Pool mit drei Bildern soll nicht verhungern.

### Raster

Die Kachelzahl ist **fest**, das Raster folgt der Orientierung:

| Verhältnis (Breite ÷ Höhe) | Ziel | Raster | Kacheln |
|---|---|---|---|
| ≥ 1,1547 | 4:3 | 8 × 6 | 48 |
| ≤ 0,8660 | 3:4 | 6 × 8 | 48 |
| dazwischen | 1:1 | 7 × 7 | 49 |

Die beiden Schwellen sind die geometrischen Mittel der drei Ziele (√(4/3) und √(3/4)) — jedes Bild
landet damit bei dem Zuschnitt, der am wenigsten wegschneidet. Zugeschnitten wird mittig.

Die Kachelzahl fest zu halten ist die Voraussetzung dafür, dass ⌀-Reaktionszeiten überhaupt
vergleichbar sind: 48 gegen 49 ist ein Rundungsfehler, 48 gegen 30 wäre eine andere Runde.

### Takt

Gezogen mit `random.scene.weightedPick` aus einer Gewichtstabelle:

```
 900:1   1000:4   1100:4   1200:8   1300:9   1400:3   1500:1   1800:2   1900:1   2000:1
```

**Das ist die Verteilung der 35 Entstauber-Instanzen des Originals**, nicht ein geratenes Band (die
eine 960-ms-Runde ist auf 1000 gerundet). Median 1300 ms, 80 % zwischen 1000 und 1400, dazu eine
Schleppe bis 2000.

Die Schleppe gehört dazu und ist kein Ausreißer: **lang ist nicht leicht.** Bei 2000 ms dauert eine
Runde 96 Sekunden, und die letzten Kacheln treffen auf eine Konzentration, die längst nachgelassen
hat. Kurz ist auf die andere Art schwer. Genau deshalb wird gezogen und nicht festgelegt.

Keine Phasenabhängigkeit: `CLOSEST_ONLY` schärft Phase zwei bereits, ein zweiter Hebel wäre doppelt.

### Reihenfolge

`random.presentation.shuffled((0 until cols * rows).toList())` — ein Aufruf, und `SeededRandom`
bringt ihn mit.

### Bühne

```kotlin
data class DedusterScene(val cols: Int, val rows: Int, val intervalMs: Int) : GameScene
```

Das Raster unter der Hülle braucht `cols`/`rows`, das Einzählen im Takt braucht `intervalMs`; das
Foto kommt als Asset unter `SCENE_ASSET_KEY`. Feld-Set-Test in beide Richtungen, wie bei
`FindPatternScene`.

### Payload

```kotlin
data class DedusterPayload(
    val cols: Int,
    val rows: Int,
    val intervalMs: Int,
    val order: List<Int>,
) : GamePayload
```

**Ohne `imageId`.** Die Bytes kommen über den Runden-Asset-Endpunkt; die Pool-Id im Payload wäre
eine zweite, ungetorte Adresse auf dasselbe Bild. Feld-Set-Test wie bei Musterung.

`cols`, `rows` und `intervalMs` stehen in Bühne **und** Payload — wie bei Musterung. Der Payload
bleibt damit für sich lesbar, auch dort, wo keine Bühne mitkommt.

`solution()` gibt `null` zurück. Der Lohn — „der verstaubte Schatz“ — ist, dass die Komponente nach
dem Ende die Staubschicht fallen lässt; das braucht keinen zweiten Serverausgang. Entstauber ist
damit das erste Spiel, das die Vorgabe von `GameType.solution` mit Absicht stehen lässt, und der
Feld-Set-Test hält fest, dass es `null` bleibt.

### Das Bild wird beim Ankündigen eingefroren

`materialised(params, roundGameId)` holt das Original aus dem Pool, wendet die EXIF-Orientierung an,
schneidet mittig auf das Zielverhältnis, skaliert (ohne hochzurechnen) auf die konfigurierte lange
Kante und schreibt ein JPEG:

```sql
CREATE SCHEMA IF NOT EXISTS deduster;

CREATE TABLE deduster.round_images (
    round_game_id UUID PRIMARY KEY,   -- weiche Referenz auf game.round_games, wie songsnippet.round_audio
    media_type    TEXT        NOT NULL,
    bytes         BYTEA       NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`asset(params, roundGameId, SCENE_ASSET_KEY)` liest sie; jeder andere Schlüssel gibt `null`.
Idempotent, weil beim Ankündigungsrennen beide ersten Aufrufer den Haken ziehen: `INSERT … ON
CONFLICT DO NOTHING`.

Das Labor nimmt denselben Weg über `produceAssets`, ohne Tabelle — sein Rundenspeicher hält die
Bytes im Arbeitsspeicher.

`releaseStageAssets` rührt das Bild **nicht** an: die Historie zeigt vergangene Runden, und ein
Entstauber ohne Bild wäre dort ein leeres Raster. Es ist damit der Fall, für den `releaseAssets`
existiert — die Archivierung einer Edition, die bis heute keinen Aufrufer hat.

| Eigenschaft | Wert |
|---|---|
| `deduster.play-image-edge` | 1600 px (lange Kante) |
| `deduster.play-image-quality` | 0,82 |

Gemessen gegen typische Handyfotos ergibt das ~300–500 KB je Runde. Über drei Gemeinschaften und
einen vollen Countdown sind das rund 70 MB, dauerhaft. Das ist der Preis dafür, dass eine Runde
unveränderlich ist.

**Folge für die Pool-Spec:** dort steht heute, eine Runde halte nur eine weiche Referenz und zeige
nach dem Löschen einen Platzhalter. Das gilt ab jetzt nur noch zwischen Ziehung und Ankündigung —
danach hat die Runde ihre eigene Kopie. Der Satz gehört in beiden Dokumenten korrigiert.

## Tipp, Urteil, Markierung

```kotlin
enum class DedusterEnd { COMPLETE, TOO_LATE, WRONG_TILE }

data class DedusterGuess(
    /** Reaktionszeit je rechtzeitig getroffener Kachel, in Taktreihenfolge. */
    val reactionsMs: List<Int>,
    val endedBy: DedusterEnd,
    /** Nur bei `WRONG_TILE`: welche Kachel stattdessen getippt wurde. Rein für die Auswertung. */
    val wrongTileIndex: Int? = null,
    /** Nur bei `WRONG_TILE`: Zeit des Fehlgriffs seit der letzten gefallenen Kachel. Für die Kurve. */
    val wrongReactionMs: Int? = null,
    /** Der Lauf begann nach einem Neuladen. Siehe „Neu geladen“. */
    val restarted: Boolean = false,
)
```

`reactionsMs.size` **ist** „wie weit gekommen“ — eine Zahl weniger, die widersprechen kann. Das
Level des Fehlgriffs ist `reactionsMs.size` und muss deshalb auch nicht mitreisen.

**`judge` wirft nur bei Unverwertbarem** (`InvalidGuessException` → 400): kein Array, mehr Einträge
als Kacheln, negative Werte, oder `COMPLETE` ohne volle Länge. Das ist ein Client-Fehler, kein Lauf.

**Ein unbrauchbarer `wrongTileIndex` kostet den Lauf nicht.** Fehlt er, liegt er außerhalb des
Rasters oder zeigt ausgerechnet auf die richtige Kachel, wird er auf `null` gesetzt und eine
WARN-Zeile geschrieben; die Auswertung zeichnet dann keine Fehlmarkierung. Er ist Schmuck, kein
Urteil, und darf nichts entscheiden. Dasselbe gilt für `wrongReactionMs`: alles außer einer ganzen
Zahl in `0..intervalMs` wird stumm `null`, und nichts davon geht in ⌀ oder Punkte ein.

**Markiert statt abgewiesen:** eine Reaktion unter `MIN_HUMAN_MS` (120) oder über dem Takt setzt
`implausible` und eine WARN-Zeile mit Runde (über die Bild-Id) und Grund. Den Spieler nennt sie
nicht, `judge` kennt ihn nicht; die Zeile in `round_plays` trägt die Markierung und den Spieler. Der
Lauf wird trotzdem gespeichert und gewertet. Das ist die bewusste Umkehr gegenüber dem Original,
das mit 400 abwies: ein Lauf ist nicht wiederholbar, ein Fehlalarm dürfte ihn also nie kosten.

| | |
|---|---|
| `qualifies` | `endedBy == COMPLETE` — wörtlich `calculateDedusterPoints` |
| `deviation` | ⌀ der `reactionsMs`; bei leerer Liste `intervalMs` |
| `outcome` | `tilesCleared`, `endedBy`, `wrongTileIndex`, `averageReactionMs: Double?`, `implausible`, `restarted` |
| `guess` | **neu gebaut** aus den vier validierten Feldern |

`deviation` bei leerer Liste auf `intervalMs` und nicht auf `0.0`: null wäre „perfekt“, und `NaN`
hat in einer Spalte, über die `minOfOrNull` und `==` laufen, nichts verloren. `intervalMs` ist der
schlechtestmögliche echte Wert, kein Sentinel.

`averageReactionMs` ist `Double?` und `null` bei leerer Liste, damit die Tabelle „—“ zeigen kann,
wie das Original es tat.

**Der Tipp wird neu gebaut**, nicht durchgereicht — `Judgement.guess`, der Weltanschauung-Präzedenzfall.
Die Spalte wird nach dem eigenen Tipp an alle Mitspieler ausgeliefert; was dort landet, soll aus den
vier Feldern bestehen, die geprüft wurden, und aus nichts sonst.

### Punkte

| Phase | Regel | Original |
|---|---|---|
| eins | `ALL_QUALIFYING` — jeder Durchhalter bekommt den Punkt | `calculateDedusterPoints` |
| zwei | `CLOSEST_ONLY` auf die ⌀-Reaktionszeit | `filterWorseDedusterGuesses` |

Gleichstand auf die Millisekunde: beide behalten die vollen Punkte (`pointsFor` teilt nicht). Das
Original verhielt sich gleich — `best - avg < 0` schoss bei Gleichheit niemanden ab.

**Schafft es niemand, zahlt die Runde nichts.** Im Original genauso, und `game-rounds.md` erlaubt es
ausdrücklich als Aussage des Spiels: „A game that has a genuine precondition puts it in `qualifies`;
if nobody meets it, nobody wins.“

## Die Aufspaltung des Reveal-Schalters

`requiresReveal` trägt heute zwei Bedeutungen: „einmaliges, bewusstes Aufdecken“ **und** „die
Spanne vom Aufdecken bis zum Tipp *ist* die Wertung“. Bei Musterung und Weltanschauung fällt beides
zusammen. Entstauber ist der erste Fall, wo es auseinanderfällt: es braucht das einmalige Aufdecken,
gewertet wird aber die ⌀-Reaktionszeit.

Ohne die Aufspaltung überschriebe `PlayService.guess` die `deviation` mit der Dauer — bei festem
Takt für alle Durchhalter dieselbe Zahl, und ein früher Abbruch hätte die *beste*. Das wäre keine
Wertung, sondern ein Fehler.

```kotlin
/**
 * Ob die Spanne vom Aufdecken bis zum Tipp die Wertung dieses Spiels IST.
 *
 * Ohne Vorgabe, aus demselben Grund wie [requiresReveal]: die bequeme Antwort ist nicht die sichere.
 * Der Name bindet an `durationMs` — dieselbe Spanne, ein Begriff.
 */
fun scoresOnDuration(params: P): Boolean
```

| Ort | Änderung |
|---|---|
| `GameType` | neu `scoresOnDuration(params)`, ohne Vorgabe |
| `GameTypeHandle` | durchreichen |
| `PlayService.guess` | der `deviation`-Zweig liest `scoresOnDuration` statt `requiresReveal` |
| `RoundResponses` | `timed` — was `durationMs` in beiden Play-DTOs treibt — wird `scoresOnDuration` |
| `GameDto` | trägt beide Felder |
| `webapp-vue` | `api/types`; der Auslöser der Stoppuhr im Band hängt an `scoresOnDuration` |

Antworten auf `requiresReveal(params)` / `scoresOnDuration(params)`: Farbausmalung `false`/`false`,
Anspielung `false`/`false`, Musterung und Weltanschauung `params.timed`/`params.timed`,
**Entstauber `true`/`false`**.

Dass `durationMs` mitwandert, ist kein Beifang: `game-rounds.md` veröffentlicht die Dauer genau
dann, wenn sie die Wertung ist. Für Entstauber ist sie Leerlauf plus Spielzeit und sagte damit
„wie lange jemand auf der Runde saß“ — das, was die Regel schützt.

## Der Start

**Das Aufdecken der Runde ist der Start.** Nicht aus Sparsamkeit, sondern weil es die einzige
serverseitig sichtbare Marke ist: `revealOnce` verhindert ein zweites Aufdecken, aber der Lauf
selbst lebt zwischen Aufdecken und Tipp vollständig im Browser. Ein eigener START-Knopf danach
machte ein legitimes Neuladen *vor* dem Start ununterscheidbar von einem Abbruch *im* Lauf — dann
kann niemand mehr etwas bemerken.

Die [Hülle](2026-09-25-reveal-cover-design.md) liefert dafür alles: das Spiel ist gemountet, die
Bühne steht unter Milchglas, und das Halten ist das Einzählen.

```
unter der Hülle               halten, im Takt der Runde       Ring voll = 0
 Staubraster aus scene   ──▶  [3] ── [2] ── [1] ──────────▶  Hülle weg, POST /reveal
 Foto (SCENE_ASSET_KEY)       je Beat intervalMs              │
 dekodiert → ready                                            │  ein Takt: ganzes Raster, alles Staub
                                                              ▼  (der POST läuft darin)
                                                             Kachel 0
```

- **`ready` heißt: Foto dekodiert.** Das Raster steht aus `scene` sofort, das Foto lädt unter der
  Hülle. Erst wenn `decode()` durch ist, erscheint der Knopf — niemand startet gegen ein halb
  geladenes Bild. Scheitert das Laden, `failed`, und `retry` lädt neu; ein Versuch kostet das nicht.
- **Eingezählt wird im Takt der Runde.** `HoldButton` bekommt neben `beats` einen Prop `beatMs`
  (Vorgabe `BEAT_MS`), `RevealCover` reicht ihn durch; Entstauber hält `3 × intervalMs`. Wer 3-2-1
  gehalten hat, hat den Puls dreimal gespürt — dasselbe, was im Original der leere erste
  `setInterval`-Durchlauf tat. Bei 2000 ms sind das 6 s Halten, bei 900 ms 2,7 s.
- **Die Hülle fällt mit dem vollen Ring, nicht mit dem Payload.** Dann steht einen Takt lang das
  ganze Raster offen, jede Kachel noch unter Staub — der vierte Beat des Einzählens, sichtbar. Das
  Spiel setzt die Hülle mit `v-if="sealed && !ringFull"`, es gehört ihm.
- **Kachel 0 fällt bei `max(ringFullAt + intervalMs, Payload da)`**, gemessen mit
  `performance.now()`. Der POST läuft in diesem Takt, der Puls läuft ohne Bruch weiter. Kommt die
  Antwort später als ein Takt, wird nur dieser Takt länger. Bis Kachel 0 fällt, nimmt das Brett
  keine Tipps an.
- **Damit weicht Entstauber bewusst vom Hüllen-Vertrag ab**, nach dem die Hülle im selben Render
  fällt, in dem der Payload ankommt. Der Vertrag schützt die gewertete Uhr — Entstauber hat keine —,
  und unter dem Glas liegt nur Staub, der danach ohnehin zu sehen ist. Scheitert der Reveal, liegt
  die Hülle wieder, auf `ready` und für ein neues Halten.
- **Das Briefing sagt es an:** eine eigene Zeile „Beim Halten wird im Takt des Spiels eingezählt.“
  Die Hülle trägt keinen Spieltext.
- **Der Warnsatz ist ein anderer.** „Deine Zeit läuft ab dem Aufdecken“ stimmt hier nicht.
  `RevealCover` bekommt `timed` (Vorgabe `true`), Entstauber setzt `false` und die Hülle sagt: „Der
  Lauf startet mit dem Aufdecken — und du hast nur **einen** Versuch.“ Beide Sätze bleiben Konstanten
  der Hülle. Die Vorgabe ist die sichere Richtung: ein ungezeitetes Spiel, das vor Zeit warnt,
  schadet nicht, umgekehrt schon. Das Spiel setzt den Prop selbst — die Hülle gehört ihm, und es
  weiß, ob es auf Zeit spielt.

### Neu geladen

Der Server sieht nur „aufgedeckt, noch nicht getippt“ und kann Absturz, Anruf und Absicht nicht
unterscheiden. Nach dem Neuladen ist `sealed` falsch, die Hülle der Karte liegt also nicht mehr.

**Das Spiel legt dann seine eigene `RevealCover` auf**, ohne POST: dasselbe Halten, dasselbe
Einzählen im Takt, `ready` erst mit dekodiertem Foto. `start` beginnt den Lauf direkt, Kachel 0
einen Takt nach dem vollen Ring. Die Hülle zeigt unter dem Knopf einen Satz über ihren neuen Prop
`note`: „Neu geladen — dein Lauf wird markiert.“ Der Lauf trägt `restarted` im `outcome` und ein
Zeichen in der Auswertung.

Erkannt wird das ohne Serverwissen und ohne Session-Storage: das Spiel wurde mit Payload und ohne
Tipp gemountet und hat in diesem Mount nie `sealed` gesehen. Im Labor gilt dasselbe, dort ist
`sealed = !round.revealed`.

Dasselbe Instrument wie `implausible`, dieselbe Begründung: ein Absturz darf keine Runde kosten, die
niemand wiederholen kann. Der Vermerk ist client-gemeldet und damit fälschbar — wer ihn fälscht,
fälscht aber auch die Reaktionszeiten, und dann ist die Markierung nicht das schwächste Glied.

## Frontend

`webapp-vue/src/games/deduster/`, nach dem Muster der Nachbarn:

| Datei | Aufgabe |
|---|---|
| `DedusterBriefing.vue` | die fünf Regelzeilen, wörtlich aus dem Original, dazu die Zeile zum Einzählen |
| `DedusterGame.vue` | die Weiche: Brett ↔ Auswertung |
| `DedusterBoard.vue` | Raster, Staub, Hülle (auch die eigene nach dem Neuladen), Takt, Ripple, Abgabe |
| `DedusterReveal.vue` | das freigelegte Bild, Kurve und Tabelle |
| `DedusterChart.vue` | die Auswertungskurve als inline-SVG |
| `DedusterScoreboard.vue`, `scoreboard.ts` | Zeilen und Sortierung |
| `useDedusterRun.ts` | der Lauf, rein, mit injizierter Uhr |
| `types.ts` | die Typwächter |

Dazu die Einträge in `games/registry.ts` und `gamelab/games.ts` (`{ id: 'deduster', title: 'Entstauber' }`).

Acht Festlegungen, die nicht beliebig sind:

- **Kein Übergang beim Freilegen.** Jede Transition kostet Reaktionszeit, und zwar auf jedem Gerät
  anders. Die Kachel wechselt hart.
- **Ripple als Rückmeldung.** Ohne ihn erfährt man den Treffer erst am nächsten Takt — und bei der
  letzten Kachel gar nicht. Grün beim Treffer (auch beim Nachschießen auf dieselbe Kachel), rot bei
  allem anderen; rot ist dann das Letzte, was man sieht. Eigenbau: auf `pointerdown` einen absolut
  positionierten Kreis am Berührpunkt einsetzen, `Element.animate()` auf Scale und Opacity, im
  `finish` entfernen. Ein Element pro Tipp — keine der Massen-`animate()`-Fallen aus
  `frontend-ui.md`.
- **Gemessen wird mit `performance.now()`**, nicht `Date.now()`: monoton, immun gegen NTP-Sprünge.
  Der Stempel fällt im `requestAnimationFrame` **nach** dem Kachelwechsel, damit die Renderzeit
  nicht als Reaktion zählt.
- **Tab weg = Lauf zu Ende** (`visibilitychange` → `TOO_LATE`, Abgabe). Mobile Browser drosseln
  Timer im Hintergrund; ohne das wäre der App-Wechsel eine Pausetaste.
- **Kein „scroll lock“-Häkchen mehr.** Während des Laufs `touch-action: none` auf dem Brett und der
  Seitenscroll gesperrt. Der Spieler stellt nichts ein.
- **Tap-Ziele.** 360 px Viewport: Hochformat 6 Spalten → 60 px, Quadrat 7 → 51 px, Querformat 8 →
  **45 px**, knapp über der 44-px-Grenze aus `frontend-ui.md`. Das ist der schlechteste Fall und
  gehört gewusst.
- **Die Reihenfolge erreicht das DOM nie** — `ref`, kein `data-`Attribut, keine Klasse auf der
  kommenden Kachel. Der `FindPatternBoard`-Präzedenzfall.
- **Das Ende gibt selbst ab.** `emit('guess', …)`, kein zweiter Knopf; danach nimmt das Brett keine
  Tipps mehr an.

### Auswertung

Tabelle: Name / ⌀ ms / Level % / raus / Punkte, sortiert nach Punkten ↓, Level % ↓, ⌀ ms ↑ — die
Spalten und die Sortierung des Originals. „raus“ liest sich `mit Applaus` / `zu spät` / `verklickt`.
Dazu die zwei Zeichen für `implausible` und `restarted`, und „—“ statt einer Zahl, wenn jemand keine
einzige Kachel traf.

### Die Kurve, ohne `echarts`

```
 ms │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ← Game Over (über dem Takt)
1300├────────────────────────────────────────────────
    │      ╭──╮                        ╭╮
    │  ╭───╯  ╰──╮      ╭───╮      ╭───╯╰┄┄╳  ← gestrichelt: der Fehlgriff zu seiner Zeit
    │──╯         ╰──────╯   ╰──────╯             („zu spät“: gestrichelt hoch ins Band)
 ┄┄┄│┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ← ⌀ dieses Spielers
 200└──┬────┬────┬────┬────┬────┬────┬────┬────┬──
       0    5   10   15   20   25   30   35   40   45
                           Level
```

Alles daran ist reines SVG: eine `<polyline>` je Spieler in seiner Avatarfarbe, ein `<rect>` als
Game-Over-Band oberhalb des Takts, eine gestrichelte `<line>` je ⌀, ein paar `<text>` an den Achsen.
Bei fünfzehn Spielern sind das fünfzehn DOM-Knoten, nicht 720 Punkte. Einen Dark Mode hat die App
nicht, also auch keine `dark:`-Varianten.

Überschrift „Reaktionszeit (kleiner ist besser)“, im Stil von „Auswertung“; `[ms]` oben an der
y-Achse, „Level“ mittig unter der x-Achse. Level zählen ab 0, Ticks alle fünf (0 … 45), die Achse
endet an der letzten Kachel. Feine hellgraue Linien auf jedem Vielfachen von 300 ms zwischen Boden
und Takt, Zahlen deutsch formatiert. Reihenfolge der Auswertung: Bild, Kurve, Tabelle.

Was anders ist als bei `echarts`:

- **Statt Tooltip ein Scrub.** Finger über die Fläche ziehen → senkrechte Führungslinie am nächsten
  Level, kleine Ablesebox. Auf dem Handy besser als ein Hover, den es dort nicht gibt.
- **Statt Legende die Tabellenzeilen.** Zeile antippen → diese Linie hervor, die anderen blass. Das
  spart ein Widget, das auf 360 px drei Zeilen hoch wäre.
- **Der Rückkanal zum Bild bleibt** — er war der Grund, warum aus der Kurve ein Gespräch wurde. Beim
  Scrubben auf Level *L* umrandet das freigelegte Bild:
  - die **richtige** Kachel dieses Levels (`order[L]`);
  - und **rot** jede Kachel, auf die an genau diesem Level jemand fälschlich getippt hat — also für
    jeden Spieler mit `endedBy == WRONG_TILE` und `reactionsMs.size == L` dessen `wrongTileIndex`.
    So sieht man, dass man eine Kachel zu weit rechts lag.
  - In der roten Kachel sitzen **Punkte in den Spielerfarben**, denn mehrere können auf dieselbe
    falsche Kachel getippt haben. Jeder Punkt bekommt einen dünnen Kontrastrand, sonst verschwindet
    eine rote Avatarfarbe im roten Feld.
  - Eine Zeitüberschreitung markiert nichts: es gibt keine getippte Kachel, und ein Punkt auf der
    *richtigen* Kachel läse sich wie ein Treffer.
- **Weg:** Zoom, Toolbox, Animationen beim Datenwechsel.

## Integrität — die Decke, benannt

Zwei Regeln aus `game-integrity.md` hält dieses Spiel nicht ein, und beide Male ist das eine
Entscheidung, keine Lücke.

**„Was die Antwort trägt, verlässt den Server als Bild.“** Die Kachelreihenfolge verlässt ihn als
Liste. Wer die Netzwerkantwort liest, kennt die nächste Kachel. Das ist nicht schließbar: bei 900 –
2000 ms Takt ist ein Roundtrip pro Kachel ausgeschlossen, und ein Push-Kanal (SSE, WebSocket) löste
nur die Hälfte — gemessen würde weiter im Browser — und bezahlte es mit einem Lauf, den ein
Jitter-Spitzer beendet. Im Original stand die Reihenfolge sogar im ausgelieferten JavaScript.

Was gratis ist und trotzdem geschieht: die Reihenfolge erreicht das DOM nie. Das erledigt den
beiläufigen Blick im Elements-Panel; der Network-Tab bleibt offen, und das steht hier, statt
vergessen zu werden.

Vor dem Aufdecken ist die Reihenfolge dagegen dicht: sie steht nur im Payload, und die Bühne kommt
aus einem eigenen Strom, aus dem sie sich nicht zurückrechnen lässt. Auswendig lernen kann sie
niemand, bevor sein Lauf zählt.

**„Zeitwertung ist serverseitig — keine Client-Stempel.“** Die ⌀-Reaktionszeit kommt aus der
Browser-Uhr. Bei festem Takt gibt es keine serverseitige Ersatzmessung: `revealedAt → guessedAt` ist
Leerlauf plus 48 Takte und für alle Durchhalter praktisch dieselbe Zahl. Und ein Abgleich gegen sie
wäre hier auch nicht zu haben — `GameType.judge` bekommt keine Zeitstempel, und das ist Absicht.

Die Gegenmittel sind der Plausibilitätsboden (unter 120 ms ist keine Reaktion, über dem Takt ist
unmöglich), die Sichtbarkeit der Markierung in der Auswertung, und die Tatsache, dass die einzelnen
Reaktionszeiten roh gespeichert werden und jederzeit nachgerechnet werden können. Ein entschlossener
Fälscher gewinnt trotzdem. Das ist die Decke eines Reaktionsspiels ohne Roundtrips, und sie wird
hier ausgesprochen statt versprochen.

## Tests

**Backend** (kotest, MockMvc-Kotlin-DSL, Testcontainers):

- `DedusterGameTypeTest`: Feld-Set von `present()` und `solution() == null`; `order` ist eine
  Permutation; das Raster folgt der Orientierung an beiden Schwellen; die Taktverteilung; die
  Bildwahl bevorzugt den Community-Bestand und fällt auf den globalen zurück; `previousParams`
  schließt aus und verhungert nicht; `isAvailable` bei leeren Beständen.
- Feld-Set von `scene()` in beide Richtungen: genau `cols`, `rows`, `intervalMs`.
- Stromtests wie bei Musterung: verschiedene Solution-Seeds ändern nichts an den Params — hier
  trivial erfüllbar, weil `random.solution` unberührt bleibt, und genau deshalb festgenagelt;
  verschiedene Presentation-Seeds ändern nichts an Bild und Takt, verschiedene Scene-Seeds nichts an
  der Reihenfolge.
- `GameRandom.fromSeed`: die drei Ströme liefern verschiedene Folgen.
- `PlayService.asset` und `LabService.asset`: `SCENE_ASSET_KEY` ist vor dem Aufdecken erreichbar,
  jeder andere Schlüssel nicht; ein Spiel ohne Bühnen-Asset gibt 404.
- `judge`: wirft bei Unverwertbarem; ein unbrauchbarer `wrongTileIndex` kostet den Lauf nicht;
  markiert statt zu werfen; `qualifies`/`deviation`/`outcome` exakt; der Tipp wird neu gebaut und
  trägt keine Fremdfelder.
- Eine **Paritätstabelle**, die `calculateDedusterPoints` und `filterWorseDedusterGuesses` Zeile für
  Zeile nachstellt: mehrere Läufe einer Runde hinein, Punkte heraus, in beiden Phasen.
- `PlayServiceTest`: ein Spiel mit `requiresReveal = true, scoresOnDuration = false` behält seine
  eigene `deviation`, und `durationMs` fehlt in beiden Play-DTOs.
- `round_images` gegen Testcontainers: Bytes hinein und heraus, `INSERT … ON CONFLICT` ist
  idempotent, `releaseStageAssets` lässt die Zeile stehen.
- `ModularityTests`: `deduster → imagepool`, `game → deduster` — und `imagepool` exportiert nach wie
  vor nichts außer dieser einen Schnittstelle.

**Frontend** (Vitest):

- `useDedusterRun` mit injizierter Uhr: Treffer, Nachschuss auf dieselbe Kachel, zu spät, verklickt,
  vollständig; die Reaktionsliste; `visibilitychange` beendet den Lauf.
- `scoreboard.ts`: Sortierung und das „—“.
- `DedusterChart`: die Skalenrechnung (Level → x, ms → y), und dass der Scrub die Fehlkacheln genau
  des getroffenen Levels meldet.
- `DedusterBoard`: die Reihenfolge steht nicht im DOM; `ready` erst nach dem Dekodieren des Fotos;
  die Hülle fällt mit dem vollen Ring, Kachel 0 einen Takt danach, bei später Antwort beim
  Eintreffen; Tipps vor Kachel 0 zählen nicht; ein gescheiterter Reveal legt die Hülle wieder;
  mit Payload, ohne Tipp und nie `sealed` gemountet → eigene Hülle mit `note`, `start` sendet
  keinen Reveal, der Tipp
  trägt `restarted`.
- `HoldButton` mit `beatMs`: `holdMs = beats × beatMs`, ohne `beatMs` wie bisher.
- `RevealCover`: `timed = false` zeigt den zweiten Satz, `note` erscheint unter dem Knopf; ohne
  beide Props wie bisher.

## Folgen für andere Dokumente

- `game-integrity.md` bekommt den Absatz oben: das erste Spiel, das zwei seiner Regeln nicht
  einhalten kann, und warum das entschieden und nicht vergessen ist.
- `game-rounds.md`: `requiresReveal` und `scoresOnDuration` sind zwei Fragen; die Dauer wird
  veröffentlicht, wenn sie die Wertung ist. Der dritte Strom existiert jetzt („which nothing builds
  today“ fällt), und `SCENE_ASSET_KEY` ist das einzige Asset vor dem Aufdecken.
- Die Hüllen-Spec: ihr Nachtrag zu Entstauber ist mit dieser Fassung erledigt.
- `modules-and-migrations.md`: `deduster` in die Modulliste.
- Die Bild-Pool-Spec: die Platzhalter-Zusage gilt nur noch bis zur Ankündigung.
