# Peilung („Echo Locate“) — einen Spruch im Nebel orten

**Status:** umgesetzt (2026-10-29).

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), den
[Runden-Assets](2026-10-17-round-assets-design.md), dem [Spiel-Labor](2026-08-08-game-lab-design.md)
und dem [Audio-Pool](2026-10-24-audio-pool-design.md). Phasen und Punkte übernimmt es wörtlich von
[Anmaßung](2026-10-22-kreativverhaeltnis-design.md) und Farbausmalung: kein Aufdecken, keine Uhr,
Toleranz nur in Phase eins. Die Stufen-Leiter von [Anspielung](2026-08-20-song-snippet-design.md) wird
hier zu einem Schritt mit Daten verallgemeinert. Den Entwurf auf dem Gerät und die antippbaren Namen
in der Auflösung kennt es von Anmaßung und [Blockierung](2026-10-16-blockierung-design.md).

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md), mit einer benannten Decke (siehe
*Integrität*).

**Reihenfolge:** Erst wird der Audio-Pool gebaut und als eigener PR nach `develop` gemergt (Clemens,
2026-10-25: „erst Ton-Pool, dann Spiel“). Peilung setzt danach auf `develop` auf. Ohne Pool kommt kein
Clip in eine Community, das Spiel bliebe unverfügbar und das Labor ohne Runde — einen Ersatz-Clip-Weg
gibt es deshalb nicht. Zu diesem Plan gehören vom Pool nur der erste Export (`AudioPoolQuery`,
`playableIds`) und seine Umsetzung in `audiopool.internal`.

**Berührt:**

- ein neues Modulith-Modul `echolocate` (Logik und Clip-Aufbereitung, **kein Schema**);
- den Adapter `EchoLocateGameType` in `game.internal`;
- das Framework: zwei Methoden am Vertrag (`GameType.step`, `GameType.stagesScore`), `PlayService.skip`
  und `PlayService.guess`, eine Spalte in `game.round_plays`, die Play-DTOs, `LabService` und
  `LabRoundStore`;
- das Framework, zweitens: die **Schwierigkeit** (`RoundContext.difficulty`, berechnet in
  `RoundMaterialiser`, im Labor aus dem Seed);
- den ersten Export des Audio-Pools (`AudioPoolQuery`, `playableIds`);
- im Frontend ein neues Spielverzeichnis `games/echolocate/`, die Einträge in `games/registry.ts` und
  `gamelab/games.ts`, `GameProps`, `useRound.skip`, `api/rounds.ts`, `gamelab/api.ts` und
  `LabControls` (Anzeige der Schwierigkeit).

## Zweck & Spielidee

Irgendwo auf einer abstrakten Fläche steckt ein Spruch aus der Community, später in der Edition auch
zwei, versteckt zwischen Störgeräuschen. Der Spieler setzt **Pings**: von jedem wächst eine Welle,
und jede Quelle, die sie erreicht, erklingt **genau dann**, wenn die Welle dort ankommt. Hört er einen
Spruch, tippt er aufs Feld, und dort bleibt ein Ring stehen. Drei Ringe schneiden sich ungefähr am
Ziel. Dort setzt er einen **Pin**, einen pro Spruch.

Entstanden aus einem Spike (2026-10-24). Was er gezeigt hat und was daraus folgt:

- **Eine Lautstärke-Glocke ist zu leicht.** Die erste Fassung (der Spruch wird lauter, je näher der
  Finger kommt) löste man per Gehör-Bergsteigen in Sekunden. Verworfen.
- **Vom Spiel gezeichnete Echo-Ringe sind zu leicht.** Mit exakten Kreisen ist die Runde reine
  Geometrie; Clemens traf jedes Mal genau.
- **Selbst markieren ist das Spiel** (Clemens: „Gutes Spiel. Selbst markieren zu müssen ist es.“).
  Die eigene Reaktionszeit macht die Ringe ungenau genug, dass es schwer wird.
- **Drei Pings sind das Minimum.** Mit zweien bleibt ein 50:50 zwischen zwei Schnittpunkten.
- **Zwei Sprüche gehen mit Selbst-Markieren.** Solange das Spiel zu jeder Antwort einen Kreis zeichnete,
  überforderten zwei: zu viele Kreise. Markiert man selbst, spielen sie sich „auch sehr gut“ und sind
  schwerer (Clemens, 2026-10-26). Aber nicht von Anfang an: eine Runde hat einen oder zwei, nach der
  *Schwierigkeit*.
- **Warten auf den Server stört nicht.** Mit simulierter Latenz (Median 350 ms, Deckel 2,5 s) war der
  Vorlauf vor jeder Welle „gar kein Problem“.
- **Der Spruch muss sofort mit Laut beginnen.** Stille am Anfang verschiebt jeden Ring. Der Schnitt am
  ersten Laut ist spielentscheidend (siehe *Der Clip*).

Referenz zum Anfassen: Branch `feature/audio-snippet-game-mechanics-473e7c` (Stand `20db6a38`), Seite
`/c/[slug]/spike/radar`, Code unter `webapp-vue/src/spike/listen/`. Der Spike rechnet alles im
Browser; hier rechnet der Server. Die Clips des Spikes liegen gitignored und sind nicht im Repo.

- **Codename:** `echo-locate` (Game-ID), `echolocate` (Modul), `EchoLocate*` (Klassen).
- **Anzeigename:** „Peilung“ (gewählt 2026-10-25): man peilt eine Quelle über ihr Signal an, und wer
  „keine Peilung hat“, hat keinen Plan — das Gefühl im Nebel.

## Die Regeln

**Das Feld:** 20 × 20 Zellen, quadratisch. Jede Quelle sitzt auf einer Zellmitte, je zwei mindestens
2 Zellen auseinander, zwei Clips mindestens 5 (siehe *Der Tipp*). Auf dem Feld liegen **ein oder zwei
Clips** (siehe *Schwierigkeit*) und **sechs Störquellen**, deren Arten reihum vergeben werden: Vögel,
Bach, Kuh, Wind, Regen, Vögel. Wie viele Clips es sind, steht auf dem Feld.

**Ein Ping** startet an der getippten Stelle eine Welle, die mit **3 Zellen pro Sekunde** wächst, bis
zu einem Radius von **12 Zellen** (60 % der Feldbreite). Jede Quelle innerhalb dieses Radius erklingt
einmal, und zwar `Abstand / Tempo` Sekunden nach dem Start der Welle. Der nächste Ping geht erst, wenn
Welle und Nachklang vorbei sind. Es gibt **drei Pings**; weniger zu benutzen ist erlaubt.

**Selbst markieren:** Ein Tipp aufs Feld, während eine Welle läuft, lässt einen Ring stehen — um den
Ping, mit dem Radius, den die Welle im Moment des Tipps hatte. So viele pro Welle, wie Clips auf dem
Feld liegen; ein Ring sagt nicht, zu welchem Spruch er gehört. Die Ringe sind ein
Werkzeug des Spielers und werden nicht gewertet. Sie reisen mit dem Tipp, damit die Auflösung zeigt,
wie jeder geschätzt hat (siehe *Der Tipp*). Automatische Echo-Ringe und Nebel aus dem Spike gibt es im
Spiel nicht.

**Die Pins:** genau einer pro Clip, ohne Namen. Nach dem letzten Ping setzt ein Tipp einen Pin, ein
Tipp auf einen Pin hebt ihn wieder ab. Abgegeben wird mit dem `HoldButton`, sobald alle Pins stehen.
Modus-Knöpfe gibt es nicht; was ein Tipp tut, folgt aus dem Ablauf (siehe *Das Feld*).

**Die Phasen — wörtlich die von Anmaßung:**

| | Phase eins | Phase zwei |
|---|---|---|
| Aufdecken | nein, das Feld ist sofort da | nein |
| Zeit | läuft nicht ins Ergebnis ein | läuft nicht ins Ergebnis ein |
| Gate | **jeder** Pin in der Zielzelle seines Clips oder einer ihrer 8 Nachbarn | keins |
| Award | `ALL_QUALIFYING`: jeder Treffer 1 Punkt | `CLOSEST_ONLY`: der kleinste Abstand nimmt alles |

Im Vertrag: `requiresReveal = scoresOnDuration = false`, unbedingt. **`deviation` ist der euklidische
Abstand vom Pin zur Mitte der Zielzelle, in Zellen; bei zwei Clips der Mittelwert der beiden.** Welcher
Pin zu welchem Clip gehört, entscheidet die kleinste Summe der Abstände, wie im Spike. Das Gate
(Clemens, 2026-10-25) rechnet dagegen in Zellen: ein Block von 3 × 3 um die Zielzelle, also höchstens
1,5 Zellen waagerecht *und* senkrecht neben der Mitte. Es ist im Spiel leicht zu erklären und in der
Auflösung leicht zu zeigen, auch wenn man das Raster beim Spielen kaum sieht. Bei zwei Clips trifft
nur, wessen **beide** Pins sitzen (Clemens, 2026-10-26); sonst wäre der zweite Spruch in Phase eins nur
Störung. Ein Tipp pro Spieler und Runde.

## Der Klang

**Jeder Clip** ist ein Asset der Runde (siehe *Der Clip*). Die **Störgeräusche spielt der Browser**:
ein rosa Grundrauschen, das die ganze Runde läuft (−24 dB gegen den Clip), und pro Störquelle eine
Antwort von 1,3 s (0 dB; Bach und Kuh 1,5 s, siehe unten). Alle Teile werden auf dieselbe Lautheit
(RMS) gebracht, auch die Clips; die dB-Werte sind also Signal-Rausch-Abstände.

**Die Störquellen sind Geräusche vom Land** (Clemens, 2026-10-26: „Vögel, Bäche, Kühe etc ist viel
besser geeignet“):

- **Wind, Regen, Vögel** synthetisiert wie im Spike (`noise.ts`).
- **Bach und Kuh** als kurze Aufnahmen (meine Festlegung): eine synthetische Kuh überzeugt nicht. Sie
  liegen im Frontend unter `games/echolocate/sounds/`, als MP3, weil jeder Browser es dekodiert. Sie
  sind gemeinfrei (CC0) oder unter CC BY mit sichtbarer Nennung; Quelle und Lizenz stehen in einer
  README daneben. Es sind keine Community-Inhalte und nichts Geheimes, sie gehören also ins Repo.
  Ihre Antwort dauert 1,5 s statt 1,3 s (Clemens' Wahl der Aufnahmen, geschnitten 2026-10-29); die
  synthetisierten Arten bleiben bei 1,3 s.
- **Keine Stimmen.** Der Spike hatte eine Quelle aus rückwärts gespielten Sprüchen; die hat man nicht
  verstanden (Clemens), sie fällt weg.

- **Mono, kein Stereo.** Links und rechts würden die Richtung verraten.
- **Ein Graph** (`audioGraph()` aus `ui/audio.ts`), wie `frontend-state.md` es für kurze Clips verlangt.
- **Ton freischalten:** Das Feld startet unter „Antippen zum Starten“. Der Tipp setzt auf iOS
  `navigator.audioSession.type = 'playback'` (sonst schweigt Web Audio am Stummschalter) und startet
  den Graphen.
- **Welle und Ton treffen sich:** Die Welle startet um den Vorlauf des Graphen plus die Ausgabelatenz
  des Geräts später (`START_LOOKAHEAD_SECONDS + outputLatency + baseLatency`), damit sie dort ist, wo es
  klingt. Bei Bluetooth bleibt ein Rest; das ist hingenommen.

## Der Zug

```kotlin
data class EchoLocateParams(
    val clipIds: List<UUID>,        // ein oder zwei, verschieden
    val grid: Int,                  // 20
    val reach: Double,              // Radius der Welle in Zellen: 12.0
    val speed: Double,              // Zellen pro Sekunde: 3.0
    val pings: Int,                 // 3
    val bedDb: Double,              // −24.0
    val noiseDb: Double,            // 0.0
    val targets: List<Cell>,        // Zielzelle je Clip, gleiche Reihenfolge — das Rundengeheimnis
    val noises: List<NoiseSource>,  // Zelle und Art — ebenfalls geheim
    /** Rand um die Zielzelle in Phase eins (1 → 3 × 3); `null` in Phase zwei, wie `toleranceDeg`. */
    val toleranceCells: Int?,
)

data class Cell(val col: Int, val row: Int)
data class NoiseSource(val cell: Cell, val kind: NoiseKind)  // BIRDS, BROOK, COW, WIND, RAIN
```

**Flexibel ohne Regler**, wie bei Anmaßung: alle Zahlen werden beim Ziehen eingefroren, und alles danach
liest nur dort. Andere Werte sind später eine Änderung der Konstanten; alte Runden behalten ihre.

**Die Ströme:**

- **Anzahl und `clipIds` aus `random.scene`:** die Clips erklingen beim ersten Ping und ihre Assets
  liegen schon vor dem Aufdecken bereit, beides ist also vor dem Tipp öffentlich. Zwei Clips mit der
  Wahrscheinlichkeit `context.difficulty`, sonst einer (siehe *Schwierigkeit*); einer auch, wenn nur
  ein Clip spielbar ist. Gewählt wird gleichverteilt und ohne Wiederholung aus
  `playableIds(communityId)` (die eigenen, sonst die globalen), ohne die dieser Edition
  (`context.previousParams`); reichen die übrigen nicht, wird aus allen aufgefüllt — die Regel von
  Entstauber und Platzierung.
- `targets` und `noises` aus `random.solution`. Zielzellen zuerst, untereinander mindestens 5 Zellen
  auseinander, dann die Störquellen, jede mit Mindestabstand 2 zu allen vorigen; nach 200 Versuchen
  nimmt eine Quelle die letzte gezogene Zelle (wie im Spike, bei 8 Quellen auf 400 Zellen praktisch
  nie).
- `toleranceCells` = 1 in Phase eins, `null` in Phase zwei.

**Verfügbar** ist das Spiel, wenn `playableIds(communityId)` nicht leer ist.

### Der erste Export des Audio-Pools

Wie beim Bild-Pool bringt das erste Spiel die Schnittstelle mit:

```kotlin
interface AudioPoolQuery {
    /** Die Clip-IDs eines Pools in stabiler Reihenfolge. `null` meint den globalen Pool. */
    fun candidateIds(communityId: UUID?): List<UUID>

    /** Das gespeicherte WAV, oder `null`, wenn der Clip gelöscht ist. */
    fun wav(id: UUID): ByteArray?
}

/** Die eigenen Clips der Gemeinschaft; die globalen nur, wenn sie keine hat. */
fun AudioPoolQuery.playableIds(communityId: UUID): List<UUID> =
    candidateIds(communityId).ifEmpty { candidateIds(null) }
```

Ohne ein Wort Spielwissen. Den Schnitt macht `echolocate`, nicht der Pool.

## Der Clip

`produceAssets` holt jedes WAV über `AudioPoolQuery.wav`, bereitet es auf und legt **ein Asset pro
Clip** ab:

| Asset | Sichtbarkeit | Medientyp | warum |
|---|---|---|---|
| `clip-0`, `clip-1` | `FromStage(0)` | `audio/wav` | aus dem Scene-Strom; bei einem Spiel ohne Aufdecken öffnet das automatische Öffnen der Karte den Schlüssel |

Die Nummer ist die Stelle in `clipIds`. Die Größe eines Assets nennt nur seinen Clip, wie Platzierungs
Brett; der Clip ist ohnehin öffentlich.

**Aufbereitung** (`echolocate`, reines JVM, `javax.sound.sampled` wie `SnippetCutter`):

1. Dekodieren, auf Mono mitteln.
2. **Der erste Laut** — die Regel aus dem Spike, Stand `d41a6488`, wörtlich:
   - Fenster von 5 ms, Lautheit je Fenster in dB (RMS);
   - Rauschboden = das 10. Perzentil aller Fenster;
   - Einsatz = das erste Fenster, das mehr als 6 dB über dem Boden liegt **und** die beiden folgenden
     ebenfalls (15 ms gehalten);
   - geschnitten wird **15 ms vor** dem Einsatz, damit der Anlaut des ersten Lauts bleibt.

   Warum nicht „5 % der Spitze“: bei einer leisen, verrauschten Aufnahme liegt schon das Rauschen
   darüber, und vor der Stimme blieben 130 ms Stille stehen (gemessen am Clip `alter`). Findet die Regel
   keinen Einsatz, wird nicht geschnitten — **markieren statt abweisen**: die Runde läuft trotzdem.
3. **Höchstens 3 s** ab dem Schnitt (meine Festlegung): ein langer Clip überdeckt die anderen Antworten.
   Das ist eine Entscheidung dieses Spiels, nicht des Pools.
4. 20 ms Ein- und Ausblenden gegen Knacken. Ausgabe als WAV, 16 Bit, Mono, Abtastrate wie im Pool.

**Feste Zahlen statt Augenmaß:** ein Test mit selbstgebauten Signalen (Stille + Ton, Rauschen + Ton,
Stereo) prüft den Einsatz auf 5 ms genau.

**Ein Clip ist verschwunden** (zwischen Ziehen und Materialisieren gelöscht): `produceAssets` loggt
eine Warnung und lässt sein Asset weg, wie Platzierung. An seiner Stelle schweigt die Runde; die übrigen
Quellen klingen. Dass das passiert, ist unwahrscheinlich, und es kostet keine weitere Maschinerie.

## Schwierigkeit: neu im Rahmenwerk

Kein Spiel kennt bisher eine Schwierigkeit. Peilung braucht eine (Clemens, 2026-10-26): Zwei Sprüche
sind schwerer als einer, und wer das Spiel kennenlernt, soll mit einem anfangen. Je weiter die Edition,
desto wahrscheinlicher zwei. Andere Spiele sollen später eigene Regeln beitragen.

**Aufteilung wie bei „Das Spiel urteilt, der Rahmen vergibt“:** Der Rahmen sagt, *wie schwer* eine
Runde sein soll, das Spiel, was das für es heißt. Die Spiele kennen nur die Zahl, nicht, woraus sie
entsteht. Fließt später anderes ein, etwa eine Einstellung der Community, ändert sich der Rahmen und
kein Spiel.

```kotlin
data class RoundContext(
    // … wie bisher
    /** Wie schwer die Runde sein soll: 0.0 (leichteste) bis 1.0. Was das heißt, sagt das Spiel. */
    val difficulty: Double = 0.0,
)
```

**Die Regel:**

- **Der erste Auftritt eines Spiels in einer Edition hat 0**, egal wie spät er kommt. Wer ein Spiel zum
  ersten Mal sieht, lernt es kennen (Clemens: „Die erste Peilung einer Edition hat immer eine
  Quelle“). Bei neun Spielen und zufälliger Wahl kommt ein Spiel etwa jede neunte Runde, der erste
  Auftritt kann also weit hinten liegen. Das gilt für jedes Spiel, also steht die Regel im Rahmen und
  nicht in Peilung (Clemens, 2026-10-26: „1. Ausgabe des Spiels immer Schwierigkeit 0 – im Rahmen“).
- **Danach der Fortschritt der Edition**, linear von 0 in ihrer ersten Spielrunde bis 1 in
  `gamesUntilRound`.

```
difficulty = 0                                          wenn previousParams leer
           = (erste − n) / (erste − gamesUntilRound),   auf [0, 1] begrenzt, sonst
erste      = älteste Runde dieser Edition mit Spiel (der letzte Eintrag von history)

Spiele von T-30 bis T-0: Peilung erstmals in T-12 → 0; wieder in T-6 → (30 − 6) / 30 = 0,8
```

- **Die älteste gespielte Runde, nicht `gamesFromRound`:** Das Fenster darf nach oben offen sein
  (`null`), und eine Edition, die mitten im Fenster angelegt wird, beginnt mit ihrer ersten echten
  Spielrunde. Eine Regel für beide Fälle (meine Festlegung).
- **Wo:** eine reine Funktion `difficultyOf(…)` in `game`, aufgerufen in `RoundMaterialiser` nach der
  Wahl des Spiels, im selben `context.copy(…)` wie `previousParams` — sie braucht die früheren Runden
  dieses Typs. `isAvailable` und die Spielwahl sehen deshalb 0.
- **Der Default 0.0** ist die sichere Richtung: ein Aufrufer, der nichts sagt, bekommt die leichteste
  Runde. Er spart außerdem jede Testzeile, die einen `RoundContext` baut.
- **Nicht gespeichert, nicht angezeigt.** Eingefroren wird die Wirkung in den Params, bei Peilung die
  Zahl der Clips. Ein später verschobenes Fenster ändert nur kommende Runden. Die Spieler sehen „2
  Sprüche“, keine Schwierigkeit.
- **Labor:** kein Regler (Clemens, 2026-10-26). Die Schwierigkeit folgt aus dem Seed,
  `seed.mod(11) / 10.0`, also 0,0 bis 1,0 in Zehnteln. Ein neuer Seed würfelt sie mit. Seed und Phase
  bleiben der Schlüssel der Laborrunde. Bewusst nicht aus `GameRandom`: ein Zug aus einem der drei
  Ströme würde alles verschieben, was das Spiel danach zieht.
- **Anzeige im Labor** (Clemens, 2026-10-26): unter dem Seed im Nav-Menü eine Zeile „Schwierigkeit
  0,7“. Der Wert kommt vom Server, auf demselben Weg wie `awardRule`: Feld `difficulty` in
  `LabRoundResponse` (Kotlin und `types.ts`), von der Laborseite als Prop an `LabControls`. Er gehört
  wie die Regelzeile zur geladenen Runde, nicht zur URL, und wird nicht im Browser aus dem Seed
  nachgerechnet.

**Peilung:** zwei Clips mit der Wahrscheinlichkeit `difficulty`, sonst einer. Am Anfang der Edition
also fast sicher einer, am Ende fast sicher zwei. Die Abbildung ist eine Funktion im Spiel; sie
nachzustellen ist eine Änderung dort.

## Pings: die Leiter wird ein Schritt

Anspielung hat eine **Stufen-Leiter**: `stage` am `RoundPlay`, „mehr hören“ über `POST
/current/skip` mit `fromStage` als Schutz gegen doppelte Klicks. Genau das braucht ein Ping auch —
einen Zähler pro Spieler, einen geschützten Schritt, Zustand nach dem Neuladen, ein Labor, das ihn
nachspielt. Nur Anspielung benutzt die Leiter heute; die Änderung lässt sich an einem Spiel prüfen.

**Was heute fest an „mehr als eine Stufe“ hängt** und für Peilung nicht gilt:

1. In Phase eins kostet ein falscher Tipp unterhalb der letzten Stufe eine Stufe, statt gewertet zu
   werden (`guessActionFor`). Hier würde ein falscher Pin einen neuen Ping kaufen.
2. Die Abweichung ist die Stufe (`PlayService.guess`: `stages > 1 -> play.stage`, ebenso `LabService`).
   Hier ist sie der Abstand.
3. Eine Stufe öffnet vorab berechnete, versiegelte Assets. Das bleibt, wie es ist: Peilung hat nur
   `FromStage(0)`.

Und was fehlt: der Schritt trägt keine Daten und gibt keine Antwort.

**Die Änderung am Vertrag:**

```kotlin
/**
 * Die erreichte Stufe ist die Wertung: ein falscher Tipp in Phase eins kostet eine Stufe, und die
 * Abweichung ist die Stufe (Anspielung). `false`: Stufen zählen nur Schritte; der Tipp wird gewertet
 * wie in einem einstufigen Spiel.
 */
fun stagesScore(params: P): Boolean = stages(params) > 1

/**
 * Ein Schritt von [stage] auf `stage + 1`, mit der Eingabe des Spielers. Rein: dieselben Argumente
 * ergeben dieselbe Antwort, deshalb wird sie nicht gespeichert, sondern bei jeder Antwort neu
 * berechnet. `null` heißt: dieser Schritt hat keine Antwort (Anspielung). Eine ungültige Eingabe
 * ist `InvalidStepException` → 400.
 */
fun step(params: P, stage: Int, input: JsonNode?): GameStepAnswer? {
    if (input != null) throw InvalidStepException("this game takes no step input")
    return null
}
```

- `guessActionFor` bekommt `stagesScore` statt sich auf `stages > 1` zu verlassen; ebenso die
  Abweichungs-Zeile in `PlayService.guess` und `LabService`. Für Anspielung ändert sich nichts.
- **Speicher:** `game.round_plays.steps JSONB NOT NULL DEFAULT '[]'`, die Eingaben in Reihenfolge.
  Der Zähler `stage` bleibt die Wahrheit über die Anzahl. Der bestehende geschützte UPDATE
  (`WHERE stage = :expected`) erhöht `stage` und hängt im selben Statement die Eingabe an — beides oder
  nichts.
- **Anfrage:** `SkipRequest` bekommt `input: JsonNode? = null`. Pfad und Schutz bleiben.
- **Antwort:**
  - `MyPlayDto.steps: List<StepDto>` mit `input` und `answer`, die Antwort per `step(params, i, input)`
    neu berechnet.
  - `OtherPlayDto.steps: List<JsonNode>` nur die Eingaben — gelistet wird ein anderer ohnehin erst,
    wenn er fertig ist; die Auflösung braucht seine Ping-Stellen, nicht seine Antworten.
- **Kein Schritt nach dem Tipp** und keiner über die letzte Stufe hinaus — beides gibt es schon als
  Ausnahme (`AlreadyGuessedException`, `StageMovedOnException`); der Umsetzer prüft, dass der UPDATE den
  Tipp mit abdeckt.
- **Labor:** `LabRoundStore` hält die Eingaben pro Spieler, `LabService.skip` spiegelt
  `PlayService.skip` samt Antwort.

Für Peilung: `stages(params) = pings + 1` (Stufe = verbrauchte Pings), `stagesScore = false`.

## Die Ping-Antwort

Eingabe: `{ "x": 7.31, "y": 12.08 }`, Zellkoordinaten als Kommazahl in `[0, grid]`. Alles andere →
`InvalidStepException`.

```kotlin
data class EchoLocateEcho(val hits: List<EchoHit>) : GameStepAnswer
data class EchoHit(
    val sound: Sound,   // CLIP, BIRDS, BROOK, COW, WIND, RAIN
    val clip: Int?,     // bei CLIP die Stelle in clipIds, also das Asset clip-<n>; sonst null
    val delayMs: Int,
)
```

`step` misst von der Ping-Stelle zu jeder Zellmitte, nimmt jede Quelle mit Abstand ≤ `reach` und gibt
`delayMs = round(Abstand / speed × 1000)` zurück, aufsteigend sortiert. Keine Positionen. Ein Ping, der
nichts erreicht, antwortet mit einer leeren Liste.

## Rundengeheimnis: die Ausgänge

Jeder Ausgang ist durch einen Feldmengen-Test gepinnt:

| Ausgang | wann | Felder |
|---|---|---|
| Payload `EchoLocatePayload` | sofort | `grid, reach, speed, pings, clips, bedDb, noiseDb, toleranceCells` |
| Schritt-Antwort `EchoLocateEcho` | pro Ping, nur dem Spieler | `hits[].sound, hits[].clip, hits[].delayMs` |
| Lösung `EchoLocateSolution` | nach dem eigenen Tipp | `targets, noises, toleranceCells` |
| Outcome `EchoLocateOutcome` | nach dem eigenen Tipp, für alle | `distance, withinTolerance, pinOf` |

`clips` ist die Anzahl. `distance` ist der Mittelwert, `pinOf[i]` der Pin, der Ziel `i` zugeordnet
wurde. `withinTolerance` ist `null` in Phase zwei. Die Lösung wird nach dem Tipp ohnehin gezeigt, also
darf das Outcome Abstand und Zuordnung tragen. So zeichnet die Auflösung die Zuordnung des Servers,
statt sie in TypeScript nachzurechnen.

## Der Tipp

```json
{ "pins": [{ "x": 9.62, "y": 4.10 }, { "x": 15.2, "y": 13.9 }], "rings": [[5.81, 9.40], [], [7.24]] }
```

- `pins`: genau `clips` Einträge, jeder mit `x`, `y` in `[0, grid]`. Die Reihenfolge sagt nichts.
- `rings`: die selbst gesetzten Ringe pro Ping, als Radien in Zellen; die Stelle in der äußeren Liste
  ist die Nummer des Pings, eine leere Liste heißt: zu diesem Ping kein Ring. Höchstens `pings` Einträge
  mit je höchstens `clips` Radien in `[0, 2 × grid]` (ein Tipp während des Nachklangs darf über `reach`
  hinausgehen). Ohne Pings eine leere Liste.

Alles andere ist `InvalidGuessException` → 400, vor jedem Schreiben.

**Warum die Ringe im Tipp reisen** (Clemens, 2026-10-25: „Die Schätzung pro Ping wäre auch
interessant“): Sie entstehen nur im Browser, sind bei der Abgabe vollständig und werden nicht gewertet.
Der Tipp ist genau das, was das Framework anderen veröffentlicht, sobald sie selbst getippt haben, und
was die Historie behält — also genau dann und dort, wo die Auflösung die Ringe braucht. In die Leiter
passen sie nicht: ein Ring entsteht erst nach der Antwort eines Schritts und ist selbst kein Schritt.

`judge` prüft nicht, ob es zu einem Ring einen Ping gab; es kennt die Stufe nicht, und ein Ring ohne
Ping verrät und gewinnt nichts. Die Auflösung zeichnet einen Ring nur, wo es Ping und Radius gibt.

`judge`:

- **Zuordnung:** die Permutation der Pins auf die Ziele mit der kleinsten Summe der Abstände
  `hypot(x − (col + 0.5), y − (row + 0.5))`; bei zwei Clips gibt es zwei Kandidaten. Sie ergibt `pinOf`.
- `deviation` = Mittelwert der zugeordneten Abstände;
- `qualifies = toleranceCells == null ||` jeder Pin liegt im Block seines Ziels:
  `|col(x) − target.col| ≤ toleranceCells && |row(y) − target.row| ≤ toleranceCells`, mit
  `col(x) = min(grid − 1, floor(x))`, ebenso `row`;
- `guess` neu aufgebaut aus genau `pins` und `rings`.

**Warum zwei Clips mindestens 5 Zellen auseinander liegen** (meine Festlegung): Ein Pin im 3 × 3-Block
liegt höchstens 2,12 Zellen von dessen Mitte. Bei 5 Zellen Abstand sind die Blöcke getrennt, und wer
in beiden je einen Pin hat, bekommt genau diese Zuordnung (über Kreuz wären es mindestens
2 × (5 − 2,12) = 5,76 gegen höchstens 4,24). Gate und Zuordnung können sich so nicht widersprechen.
Nebenbei klingen zwei Sprüche seltener gleichzeitig.

## Integrität — die Decke, benannt

**Der Server kennt die Positionen, der Browser nur Verzögerungen.** Im Spike lagen die Positionen im
Browser; ein Blick in die Entwickler-Werkzeuge löste die Runde.

**Die Decke:** Die Antworten sind lesbar, mit Klangart. Wer drei Pings macht und die Verzögerungen in
Abstände umrechnet, kennt die Zielzelle exakt. Das ist hingenommen (Clemens: kein Showstopper, wie bei
mehreren Spielen).

**Ausbaustufe C, benannt und nicht gebaut:** Der Server mischt die Antwort auf jeden Ping zu einer
fertigen Tonspur — Clip und Störantworten an ihren Stellen — und schickt nur sie. Keine Zahlen mehr,
nur Samples: der Grundsatz der Anti-Cheat-Spec, das Lösungstragende von *parsebar* nach *perzeptuell*
zu verschieben. Die Decke wäre dann Signalanalyse. Was C kostet:

- **feste Länge** jeder Tonspur (`reach / speed` plus die längste Antwort), sonst verrät die Dateigröße
  die fernste Quelle;
- Störgeräusche auf dem Server erzeugen oder als Dateien mitbringen;
- rund 200 KB und etwas mehr Vorlauf pro Ping (der getestete Vorlauf lag schon im Bereich).

**B ist ein Teil von C:** Schritt-Endpunkt, Speicher der Eingaben und Neuberechnung bleiben; nur die
Art der Antwort wechselt.

## Frontend

```
games/echolocate/
  EchoLocateGame.vue        Ablauf: Feld → Auflösung (keine Hülle)
  EchoLocateBriefing.vue    InfoBox („echo-locate“) + AwardBox, mit EchoLocateRules.vue
  EchoLocateBoard.vue       Feld, Anzahl, Zustandszeile, HoldButton „Abgeben“
  SonarField.vue            Canvas: Boden, Punkt-Raster, Wellen, Ringe, Pins, Funken, Lade-Puls
  sonar.ts                  Wellenradius zur Zeit, Ringradius aus dem Tipp-Zeitpunkt — rein
  noise.ts                  Grundrauschen, Wind, Regen, Vögel — rein, aus dem Spike
  sounds/                   Bach, Kuh als MP3, dazu README mit Quelle und Lizenz
  engine.ts                 Graph: Grundrauschen-Schleife, eine Antwort pro Treffer, Vorlauf
  draft.ts                  Ringe und Pin auf dem Gerät
  EchoLocateReveal.vue      Karte, Rangliste
  EchoLocateScoreboard.vue  + scoreboard.ts
  types.ts                  Payload, Antwort, Lösung, Outcome, Tipp — defensiv eingeengt
```

Dazu `'echo-locate': EchoLocateGame` in `games/registry.ts` und `{ id: 'echo-locate', title:
'Peilung' }` in `labGameList`. Die Clips kommen über die `assets`-Prop und `useSealedAsset`, wie bei
den Bildspielen.

**Die Leiter im Frontend:** Das Spiel emittiert `skip` mit Stufe **und** Eingabe
(`skip: [stage: number, input?: unknown]`); `useRound.skip`, `skipStage` und `skipLabStage` reichen die
Eingabe durch. `GameProps` bekommt `steps` (die eigenen Schritte mit Antwort) für das Feld und die
Schritte der anderen über `entries` für die Auflösung.

### Das Feld

**Das UI ist das des Spikes** (Clemens: „vom UI/UX reicht mir der Spike“), Stand `20db6a38`, mit
dessen Standardwerten — bis auf die Modus-Knöpfe: die gibt es nicht. Was ein Tipp tut, ergibt sich
aus dem Ablauf (Clemens, 2026-10-28).

- Abstrakte, dunkle Fläche, Punkt-Raster an den Zellmitten, kaum sichtbar. Funken unter dem Finger
  ohne jede Information über den Ton.
- Über dem Feld immer die Anzahl: „1 Spruch“ oder „2 Sprüche“.

**Der Ablauf, alles per Tipp aufs Feld:**

```
zu ──Tipp──▶ Ping ──Welle + Nachklang──▶ Ping … (bis alle Pings verbraucht) ──▶ Pin
              │  Tipps in der Welle: markieren (bis zu clips)
              └  danach: der nächste Tipp ist der nächste Ping
```

1. **Zu:** Das Feld ist abgedeckt, „Antippen zum Starten“. Der Tipp schaltet den Ton frei (siehe *Der
   Klang*) und setzt noch keinen Ping.
2. **Ping:** Tipp → `skip` mit `{x, y}` → bis zur Antwort pulsiert ein Ring an der Stelle („Sonar lädt
   …“), weitere Tipps werden ignoriert → mit der Antwort startet die Welle, die Treffer werden im
   Graphen geplant. Der Ping zählt beim Tippen als verbraucht.
3. **Markieren:** Ein Tipp, solange Welle und Nachklang laufen, setzt einen Ring um den Ping mit
   `(event.timeStamp − Wellenstart) / 1000 × speed`, bis zu `clips` pro Welle, alle gleich gezeichnet;
   weitere Tipps in dieser Welle werden ignoriert. Wer nicht markiert, verliert nichts: nach dem
   Nachklang ist der nächste Tipp der nächste Ping.
4. **Pin:** Ist die Welle des letzten Pings verklungen, setzt ein Tipp einen Pin, solange welche
   fehlen; ein Tipp auf einen Pin (näher als 1,2 Zellen) hebt ihn ab. Mit allen Pins sind weitere Tipps
   daneben wirkungslos.

**Unter dem Feld** eine Zeile, die sagt, was ein Tipp gerade tut (Wortlaut meine Festlegung):
„Ping + Markieren · noch 2“, während einer Welle „Markieren“, danach „Schätzung · Pins 1/2“.
**Darunter** der `HoldButton` „Abgeben“, aktiv, sobald genau `clips` Pins stehen.
- **Abgeben:** Halten schickt `{pins, rings}` — die Pins und die Radien der eigenen Ringe, je Ping.
- **Neuladen:** Die Pings kommen vom Server (`steps`), ihre Mitten stehen wieder da; Ringe und Pin aus
  dem Entwurf. Wellen werden nicht wiederholt. Ein Ping, dessen Antwort nie ankam, ist auf dem Server
  trotzdem verbraucht, wenn der Server ihn gezählt hat — das Neuladen zeigt ihn dann mit seiner Antwort,
  aber ohne Welle.

**Entwurf** wie Anmaßung (`games/drafts.ts`): Ringe und Pin je Spieler, Runde und Phase auf dem Gerät.
Den Schlüssel nimmt der Umsetzer aus dem, was die Runde benennt (in der echten Runde `?round=`, im
Labor Seed und Phase), wie dort beschrieben.

### Auflösung und Historie

1. **Kopf:** in Phase eins „±1 Zelle“.
2. **Die Karte:** dasselbe Feld, darauf die Clips (grün), in Phase eins ihre 3 × 3-Blöcke
   hervorgehoben, die Störquellen (V, B, K, W, R) und alle Pins. **Wer einen Namen antippt, sieht dessen
   Pings** (Mitten), **dessen Ringe und Pins** hervorgehoben, dazu je eine Linie vom Pin zu seinem Clip
   (`pinOf`), wie die Ebenen bei Anmaßung; ein zweites Antippen nimmt sie wieder weg. Die Ping-Stellen
   kommen aus `steps`, die Radien aus dem Tipp.
3. **Die Rangliste:** **Name · Abstand · Pkt**, Abstand in Zellen mit einer Nachkommastelle, aufsteigend,
   bei zwei Clips der Mittelwert („Ø 2,3“); Aufgegebene zuletzt, `userId` als Tiebreak. Als pure
   `scoreboard.ts`.

Eine abgeschlossene Runde sieht in der Historie genauso aus. **Takt** aus `revealChoreography.ts`,
Feinabstimmung im Labor.

**Umsetzung (2026-10-29):** Zwei Entscheidungen, die die Spec offen ließ.

- **Die Karte zeigt immer nur einen angetippten Spieler.** „Mehrere zugleich“ bräuchte eine Farbe pro
  Spieler (zweimal „1 2 3“ auf einem Feld sind nicht zu trennen), und die Spec gibt keine. Verschoben;
  dann wird aus der Auswahl eine Liste samt Farben.
- **Die Karte öffnet auf dem eigenen Spiel.** Wer gespielt hat, sieht sein Feld, wie er es verlassen
  hat; die Karte blendet unter seinen Pings ein. Ohne eigenes Spiel (nicht mitgespielt, aufgegeben)
  bleibt sie ohne Auswahl, bis ein Name angetippt wird.

### Erklärung

`InfoBox` mit Storage-Key `echo-locate`. Kurztext: „Irgendwo im Nebel steckt ein Spruch. Peil ihn an.“

- Ein Ping schickt eine Welle los. Was sie erreicht, erklingt in dem Moment, in dem sie dort ankommt.
- Hörst du den Spruch, tipp aufs Feld: dort bleibt ein Ring stehen.
- Drei Pings, ein Pin pro Spruch. Zum Abgeben „Abgeben“ gedrückt halten.
- Später in der Edition stecken manchmal zwei Sprüche im Nebel. Dann darfst du pro Welle zweimal
  markieren, und es trifft nur, wer beide findet.

Was die Runde zahlt und welche Toleranz gilt, sagt die `AwardBox`. Deutscher Text im UI mit `„…“`.

## Labor

`echo-locate` / „Peilung“ in `labGameList` und `registry`. Der Phasenschalter zeigt beide Gesichter,
der Seed über die Schwierigkeit (siehe dort) auch einen oder zwei Clips. Die Clips entstehen über
`produceAssets` im Arbeitsspeicher, aus dem Pool der Labor-Community. Der Seed in der URL macht Clips
und Positionen reproduzierbar. Die Pings laufen über `LabService.skip`. Hier
werden Tempo, Reichweite, Pegel und Takte nachgestimmt.

## Tests

**Kotlin**

- **Schwierigkeit:** `difficultyOf` — erster Auftritt eines Typs 0, auch spät in der Edition; danach
  linear von der ältesten Spielrunde bis `gamesUntilRound`; offenes Fenster; begrenzt auf [0, 1].
  `RoundMaterialiser` reicht sie an `draw` durch; das Labor nimmt `seed.mod(11) / 10.0`, auch bei
  negativem Seed in [0, 1].
- **Zug:** Anzahl und Clips aus dem Scene-Strom; Schwierigkeit 0 → ein Clip, 1 → zwei; nur ein
  spielbarer Clip → einer; zwei verschiedene; Clips dieser Edition ausgeschlossen, Auffüllen aus allen;
  Positionen variieren nur mit dem Solution-Seed (Bauform von `GuessHueDrawTest`); Mindestabstände 2
  und 5; Arten reihum; `toleranceCells` aus der Phase; nicht verfügbar ohne Clips.
- **Clip:** Einsatz auf 5 ms genau bei Stille + Ton, Rauschen + Ton, Stereo; kein Einsatz → kein
  Schnitt; Deckel bei 3 s; Ausgabe Mono 16 Bit; ein gelöschter Clip fehlt unter den Assets, der andere
  bleibt.
- **Schritt:** Treffer innerhalb der Reichweite, Verzögerungen, Sortierung, `clip` nur bei Clips,
  leere Antwort; ungültige
  Eingabe → 400; ein vierter Ping → 409; nach dem Tipp → Ablehnung.
- **Framework:** `stagesScore = false` — ein falscher Tipp in Phase eins wird gewertet, die Abweichung
  kommt aus `judge`; ein Schritt mit Eingabe erhöht die Stufe und speichert die Eingabe atomar;
  `MyPlayDto.steps` trägt die neu berechnete Antwort; `OtherPlayDto.steps` nur die Eingaben;
  Anspielungs Verhalten unverändert (bestehende Tests grün); Labor spiegelt.
- **`judge`:** Rand des 3 × 3-Blocks drinnen und knapp draußen; zwei Clips: beide drin trifft, einer
  drin nicht, Pins in vertauschter Reihenfolge ergeben dasselbe; Mittelwert und `pinOf`; Phase zwei
  ohne Gate; ungültige Tipps, auch falsche Zahl Pins, zu viele oder unzulässige Ringe; der gespeicherte
  `guess` enthält genau `pins` und `rings`.
- **Ausgänge:** Feldmengen-Tests für Payload, Antwort, Lösung, Outcome.
- `LabPointsParityTest` bleibt grün; `ModularityTests`: `game → echolocate`, `echolocate → audiopool`.

**Vitest**

- `sonar.ts`: Wellenradius zur Zeit, Ringradius aus dem Tipp-Zeitpunkt, kein Ring vor dem Wellenstart.
- `noise.ts`: Wind, Regen und Vögel liefern hörbare Samples ohne NaN auf der Ziel-Lautheit. (Im Spike
  blieben die Vögel stumm: ein Startindex mit Nachkomma schreibt in ein `Float32Array` ins Leere.)
- Bach und Kuh: jede Art in `NoiseKind` hat einen Klang, keine bleibt stumm.
- Feld: der erste Tipp öffnet nur; „Sonar lädt“ ignoriert Tipps; in der Welle höchstens `clips`
  Ringe, danach ist der nächste Tipp ein Ping; nach der Welle des letzten Pings setzt ein Tipp einen
  Pin; Pins setzen und abheben, kein Pin über `clips` hinaus; die Zustandszeile folgt; Abgeben erst mit allen
  Pins; Neuladen zeigt die Pings vom Server; Halten ergibt einen Tipp mit genau den Pins und den Ringen
  je Ping.
- `LabControls`: die Zeile „Schwierigkeit“ zeigt den Wert der geladenen Runde, keine Zeile ohne Runde.
- `draft.ts`, `scoreboard.ts`, `types.ts` wie bei Anmaßung.

## Bewusst verschoben

- **Ausbaustufe C** (Echo als Tonspur) — siehe *Integrität*.
- **Aufnahmen auch für Wind, Regen, Vögel** (etwa von ambiph.one) statt Synthese — Lizenz an der Quelle
  prüfen.
- **Automatische Echo-Ringe und Nebel** — im Spike gespielt, verworfen.
- **Mehr als zwei Clips** und **Ringe mit Farbe pro Spruch** — mit zweien gespielt, ohne Farben.
- **Mehrere Spieler zugleich auf der Karte** — braucht eine Farbe pro Spieler, siehe *Auflösung und Historie*.
- **Schwierigkeit in anderen Spielen** — der Rahmen liefert sie allen, nur Peilung liest sie.
- **Ein Schnitt-Werkzeug im Audio-Pool** — Ausbaustufe 2 des Pools.

## Folgen für andere Dokumente

- **`game-rounds.md`** bekommt den Schritt: die Leiter trägt Daten, `stagesScore` trennt „Stufen sind
  die Wertung“ von „Stufen zählen Schritte“, Antworten werden neu berechnet, nicht gespeichert. Und die
  Schwierigkeit: der Rahmen sagt, wie schwer, das Spiel, was das heißt; der erste Auftritt eines Spiels
  ist der leichteste; nicht gespeichert, nur ihre Wirkung.
- **`game-lab.md`**: im Labor folgt die Schwierigkeit aus dem Seed, nicht aus einem eigenen Regler.
- **`frontend-state.md`**: Störgeräusche aus dem Browser, und die Falle mit dem Index mit Nachkomma in
  typisierten Arrays.
