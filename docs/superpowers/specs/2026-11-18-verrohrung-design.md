# Verrohrung („Turn Pipes“) — Rohre drehen, bis das Wasser durch jedes läuft

**Status:** beschlossenes Design (2026-11-18).

**Issue:** [unividuell/countdown#143](https://github.com/unividuell/countdown/issues/143).

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), der
[Hülle](2026-09-25-reveal-cover-design.md), der [Spieluhr](2026-09-11-game-stopwatch-design.md), dem
[Spiel-Labor](2026-08-08-game-lab-design.md) und der Schwierigkeit aus der
[Peilung](2026-10-25-peilung-design.md) (`RoundContext.difficulty`). Phasen, Punkte, Zeit,
Auflösungs-Takt, antippbare Namen und Zwischenstand übernimmt es von
[Blockierung](2026-10-16-blockierung-design.md), die sie ihrerseits von Musterung und Platzierung hat.

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — mit der Decke von Blockierung, benannt
unter *Integrität*.

**Berührt:** ein neues Modulith-Modul `turnpipes` (reine Logik, **kein Schema, keine Tabelle**), den
Adapter `TurnPipesGameType` in `game.internal`, im Frontend ein neues Spielverzeichnis
`games/turnpipes/` mit acht PNG-Kacheln und fünf Klängen, die Einträge in `games/registry.ts` und
`gamelab/games.ts`, und Blockierungs Stummschalter, der zu einem gemeinsamen wird (`ui/`). Keine neue
Abhängigkeit.

## Zweck & Spielidee

Ein quadratisches Brett aus Rohrkacheln: gerade Rohre und Bögen, dazu ein **Zulauf** (Handrad) und ein
**Abfluss**. Alle Kacheln liegen verdreht. Jedes Tippen dreht eine Kachel um 90° im Uhrzeigersinn. Ziel
ist eine Leitung vom Zulauf zum Abfluss, in der **jedes Rohr Wasser führt**. Ob es stimmt, zeigt sich
erst nach der Abgabe.

Entstanden aus einem Spike (2026-11-18). Was er gezeigt hat und was daraus folgt:

- **Kein Live-Feedback.** Mit einer grün markierten Strecke kann niemand danebenliegen; ohne sie ist
  ein falscher Tipp möglich, und Lösen allein verdient den Punkt.
- **Jedes Rohr führt Wasser.** Mit überzähligen Füllkacheln hangelt man sich von Kachel zu Kachel, auch
  auf 7×7 trivial. Deckt der Weg das ganze Brett, gibt es keine Füllkacheln mehr.
- **Zulauf und Abfluss drehen sich mit.** Feste Enden sind zwei Anker, von denen aus man vorwärts und
  rückwärts arbeitet. Drehbare Enden muss man erst ausprobieren — spürbar schwerer.
- **Das Brett ist ein Schlussfolgerungs-Puzzle.** Weil keine Öffnung ins Leere oder über den Rand zeigen
  darf, folgt jede Kachel aus ihren Nachbarn: eine Ecke passt nur in einer Stellung, der Rand folgt.
  Gemessen gilt das für 100 % der Bretter, jeder Größe, mit festen wie mit drehbaren Enden. Hingenommen:
  wer den Trick findet, ist schneller, und Phase zwei misst genau das.
- **Kein Brett ohne Rand.** Ein Umlauf (rechts hinaus, links herein) nähme den Ecken den Halt, schoss
  aber über das Ziel hinaus.
- **8×8 ist am Handy spielbar**, wenn das Brett kartenbreit liegt (siehe *Brett*).
- **Genau eine Lösung, bewiesen.** Jedes Brett hat höchstens eine Stellung ohne Leck (siehe *Warum es
  genau eine Lösung gibt*), also keine Prüfung im Generator. So sieht die „Lösung“ der Auflösung nie
  anders aus als das Brett eines Spielers, der richtig lag — bis auf gerade Rohre, die um 180° gedreht
  gleich aussehen.
- **Ton.** Klacken beim Drehen, Rauschen, solange das Wasser läuft, danach Spritzer, Strahl oder Schlag —
  echte Aufnahmen, per Gehör im Spike gewählt. Ein Gurgeln als Erfolg passte nicht: das Wasser bleibt in
  den Rohren, es fließt nicht ab.
- **Bilder nicht ziehbar.** Wer eine Kachel zum Drehen „greift“, zog im Spike das Bild.

Referenz zum Anfassen: Branch `feature/pipe-puzzle-game-spike` (Stand `65eb36fe`), Seite
`/c/[slug]/spike/rohre`, Code unter `webapp-vue/src/spike/pipes/`. Messungen in der Commit-Nachricht. Der
Spike rechnet alles im Browser; hier ziehen und werten der Server.

- **Codename:** `turn-pipes` (Game-ID), `turnpipes` (Modul), `TurnPipes*` (Klassen).
- **Anzeigename:** „Verrohrung“ — das Rohrnetz und, einen Buchstaben daneben, die *Verrohung*.

## Die Regeln

**Das Brett** hat `n × n` Kacheln, `n` aus der Schwierigkeit der Runde:

```
n = 6 + min(2, floor(difficulty × 3))      0,0 … 0,33 → 6 · 0,34 … 0,66 → 7 · 0,67 … 1,0 → 8
```

Der erste Auftritt in einer Edition hat Schwierigkeit 0, also immer 6×6 (Regel des Frameworks).

**Die Kacheln:**

| Art | Code (Leitung) | Öffnungen bei Stellung 0 | sichtbar verschiedene Stellungen |
|---|---|---|---|
| gerades Rohr | `STRAIGHT` | Nord, Süd | 2 |
| Bogen | `ELBOW` | Nord, Ost | 4 |
| Zulauf | `INLET` | Nord | 4 |
| Abfluss | `OUTLET` | Nord | 4 |

Stellung `r` ∈ 0..3 dreht die Kachel um `r` Vierteldrehungen im Uhrzeigersinn. Richtungen: 0 Nord,
1 Ost, 2 Süd, 3 West. Zellen zeilenweise, `index = y × n + x`, `(0, 0)` oben links. Diese Konvention
gilt für Server und Client gleich — das Bild jeder Art ist in Stellung 0 gezeichnet.

Zulauf und Abfluss liegen auf je einem **Randfeld**, mit Manhattan-Abstand ≥ 3, auf beliebigen Seiten
(im Spike gemessen: die Seitenwahl ändert die Schwierigkeit nicht). **Alle Kacheln drehen sich**, auch
die beiden Enden.

**Start:** jede Kachel in zufälliger Stellung. Ein Brett, das so schon gelöst wäre, wird neu verdreht.

**Bedienen:** Tippen dreht die Kachel um 90° im Uhrzeigersinn. Sonst nichts: kein Rückgängig (vier Tipps
sind die Ausgangsstellung), kein Zähler, keine Anzeige, was verbunden ist.

**Abgabe:** Halten des `HoldButton`, jederzeit aktiv — jede Stellung ist ein gültiger Tipp. Genau ein
Tipp pro Spieler und Runde — die Regel des Frameworks.

**Richtig heißt:** das Wasser läuft vom Zulauf bis in den Abfluss, und **jede Kachel führt Wasser**.
Jede Stellung, die das schafft, zählt, nicht nur die gezogene.

**Die Phasen — wörtlich die von Blockierung:**

| | Phase eins | Phase zwei |
|---|---|---|
| Aufdecken | nein, das Brett ist sofort da | **ja, genau einmal** |
| Zeit | läuft nicht ins Ergebnis ein, wird nicht gezeigt | entscheidet; Stoppuhr im Band |
| Award | `ALL_QUALIFYING` — jede richtige Abgabe 1 Punkt | `CLOSEST_ONLY` — **die schnellste** richtige nimmt alles |

Im Vertrag: `requiresReveal(params) = scoresOnDuration(params) = params.timed`, `timed` setzt der Zug
aus der Phase.

**Zwischenstand:** Die Stellungen überleben ein Neuladen — siehe *Zwischenstand* unter *Frontend*.

## Modulschnitt

```
game ──▶ turnpipes
```

`turnpipes` trägt: `PipeKind`, die **Öffnungen** einer Kachel in einer Stellung, den **Generator** und
den **Wasserlauf** — reine Funktionen, keine Datenbank. Der Adapter `TurnPipesGameType` trägt Params,
Bühne, Payload, Lösung, Outcome, Leitungsformat und Validierung — nichts davon kennt `turnpipes`.

## Der Zug

```kotlin
data class TurnPipesParams(
    /** Kantenlänge des Bretts, 6..8, aus der Schwierigkeit. */
    val size: Int,
    /** Art je Zelle, zeilenweise; genau ein INLET und ein OUTLET. */
    val kinds: List<PipeKind>,
    /** Stellung je Zelle zu Beginn, 0..3. */
    val start: List<Int>,
    /** Die gezogene Lösung: Stellung je Zelle. */
    val solution: List<Int>,
    /** Die Zellen der gezogenen Lösung vom Zulauf zum Abfluss — jede genau einmal. */
    val path: List<Int>,
    val timed: Boolean,
)
```

Gezogen wird nach Veröffentlichung (siehe [game-rounds.md](../../../.claude/guidelines/game-rounds.md)).
**Alles aus `presentation`**, wie bei Blockierung: das Brett *ist* das, was ab dem Aufdecken zu sehen
ist, und die Lösung folgt aus ihm (siehe *Integrität*) — es gibt kein Geheimnis, das ein anderer Strom
hüten müsste. `scene` und `solution` bleiben unberührt.

| Wert | Herkunft |
|---|---|
| `size` | aus `context.difficulty`, kein Zug |
| Weg, Zulauf-Seite, `kinds`, `solution`, `path` | Generator mit `presentation` |
| `start` | `presentation.nextInt(4)` je Zelle, nach dem Weg |
| `timed` | `context.phase == Phase.TWO` |

Die Grenzen (6..8, die Schwellen, Abstand ≥ 3) sind Konstanten im Code, die Wirkung friert in den Params
ein. **Verfügbar** ist das Spiel immer (`isAvailable` bleibt `true`).

### Der Generator

Übertragung von `hamiltonian` und `generate` aus dem Spike (`spike/pipes/board.ts`) nach Kotlin:

1. **Ein Weg durch jede Zelle:** eine Schlange (Zeile 0 nach rechts, Zeile 1 nach links, …), dann
   `20 × n²` **Backbite-Züge**: ein Ende wählen (Münzwurf; das andere Ende ist dann der Anfang), einen
   Nachbarn dieses Endes, der nicht sein Vorgänger ist, zufällig wählen und das Stück dahinter umdrehen —
   `pfad[0..i] + umgekehrt(pfad[i+1..])`, wenn der Nachbar an Stelle `i` steht. Der Weg bleibt dabei
   einer durch alle Zellen.
2. **Enden prüfen:** weitere Züge, bis beide Enden Randfelder sind und mindestens 3 auseinander liegen.
3. **Richtung:** Münzwurf, welches Ende der Zulauf ist.
4. **Arten und Lösung:** jede Zelle öffnet zu Vorgänger und Nachfolger; gegenüberliegend → `STRAIGHT`,
   übers Eck → `ELBOW`, erste Zelle `INLET`, letzte `OUTLET`. `solution` ist die Stellung, die genau diese
   Öffnungen ergibt.
5. **Start** würfeln (siehe oben); wäre das Brett damit gelöst, neu würfeln.

Im Spike erreichte Schritt 2 sein Ziel immer, in unter 1 ms pro Brett. Eine Obergrenze für Schritt 2
(dann von vorn ab Schritt 1) gehört trotzdem hinein; ihr Wert ist dem Bauenden überlassen.

### Warum es genau eine Lösung gibt

Eine richtige Stellung hat kein Leck: jede Öffnung trifft eine Öffnung, keine zeigt über den Rand. Hätte
ein Brett zwei solche Stellungen, bildeten die Kanten, an denen sie sich unterscheiden, geschlossene
Linien — jede Zelle hätte 0, 2 oder 4 davon. Ein gerades Rohr unterscheidet sich zwischen zwei Stellungen
an allen vier Kanten, ein Bogen an vier oder an zwei *gegenüberliegenden*; nur ein Endstück kann sich an
zwei *benachbarten* Kanten unterscheiden. Jede geschlossene Linie im Raster biegt aber in mindestens
vier Zellen ums Eck — oben links, oben rechts, unten links, unten rechts —, und dort sind die beiden
Kanten benachbart. Dafür bräuchte es vier Endstücke; ein Brett hat zwei. Also gibt es höchstens eine
Stellung ohne Leck. (Bestätigt durch Aufzählen aller Bretter mit 3×3 und 4×4 Feldern und in 6000
gezogenen Brettern.)

### Der Wasserlauf

```
Zelle = Zulauf, Richtung = seine Öffnung
wiederhole:
  Nachbar in Richtung — keiner (Rand)                 → stopp, Leck { at: null, from: Zelle }
  Nachbar hat keine Öffnung zurück                     → stopp, Leck { at: Nachbar, from: Zelle }
  Nachbar ist Abfluss                                  → angekommen
  sonst: Richtung = die andere Öffnung des Nachbarn, Zelle = Nachbar
```

Jede Kachel hat zwei Öffnungen (Enden eine), also nimmt das Wasser genau einen Weg: es verzweigt nicht,
läuft nicht im Kreis und nie zurück in den Zulauf — dessen einzige Öffnung ist schon belegt. Ergebnis: die nassen Zellen in Fließreihenfolge, ob der Abfluss erreicht ist,
und das Leck (oder keins).

## Rundengeheimnis: die Ausgänge

Jeder Ausgang ist durch einen Feldmengen-Test gepinnt (Jackson 3, `propertyNames()`):

| Ausgang | wann | Felder |
|---|---|---|
| Bühne `TurnPipesScene` | ab Ankündigung | `size` |
| Payload `TurnPipesPayload` | ab Aufdecken (Phase eins: sofort) | `size`, `kinds` (Codes), `start` |
| Lösung `TurnPipesSolution` | nach dem eigenen Tipp | `rotations`, `path` |
| Outcome `TurnPipesOutcome` | nach dem eigenen Tipp, für alle | `correct`, `wet`, `leak` |

- **Bühne:** `size` gibt der Hülle das quadratische Brett in der richtigen Höhe. Sie stammt aus der
  Schwierigkeit, aus keinem Strom, und verrät nichts über das Brett.
- **Lösung:** `rotations` = `params.solution`, `path` = `params.path` — die Auflösung lässt das Wasser in
  dieser Reihenfolge laufen.
- **Outcome:** `wet` = nasse Zellen in Fließreihenfolge, `leak` = `{ "at": Int?, "from": Int }` oder
  `null`. Geht an alle, nachdem sie selbst getippt haben: harmlos, die Lösung folgt ohnehin aus dem Brett.

**Tipp auf der Leitung:** `{ "rotations": [0, 3, 1, …] }`. Gültig: genau `size²` ganze Zahlen in 0..3.
Alles andere — falsche Länge, Bruch, außerhalb, fehlendes Feld — ist `InvalidGuessException` → 400,
**vor** jedem Schreibvorgang. `judge` gibt als `Judgement.guess` `{ "rotations": [...] }` mit der
validierten Liste zurück, wie Blockierung `{ "blocks": [...] }`.

**Die Wertung:** Wasserlauf über `params.kinds` mit den Stellungen des Tipps.
`qualifies = angekommen && wet.size == size²`, `deviation = 0.0` — in Phase zwei ersetzt der Rahmen sie
durch die Dauer. `TurnPipesOutcome(correct = qualifies, wet, leak)`.

## Integrität — die Decke, benannt

**Die Lösung folgt aus dem Payload.** Das muss sie: der Client zeichnet das Brett, und weil jede Kachel
aus ihren Nachbarn folgt, löst ein Skript es durch bloßes Weiterschließen in Millisekunden — in Phase
eins ein sicherer Punkt, in Phase zwei der schnellste Treffer. Kategorie „Lösung liegt im Sichtbaren“
wie bei Blockierung. Nicht abwendbar, ohne das Spiel zu ändern; hingenommen, wie die Anti-Cheat-Spec es
für eine Gemeinschaft unter Freunden tut.

## Frontend

```
games/turnpipes/
  TurnPipesGame.vue        Ablauf: (Hülle) → Brett → Auflösung
  TurnPipesBriefing.vue    InfoBox („turn-pipes“) + AwardBox, mit TurnPipesRules.vue
  TurnPipesBoard.vue       das Brett, HoldButton
  PipeGrid.vue             das Raster: Platten, Rohre, Wasser, Leck — von Brett und Auflösung geteilt
  tiles.ts                 Art × nass/trocken → Bild; tiles/*.png
  turns.ts                 Stellungen als fortlaufende Vierteldrehungen — rein
  draft.ts                 Zwischenstand
  TurnPipesReveal.vue      die Auflösung
  TurnPipesScoreboard.vue  + scoreboard.ts
  types.ts                 Bühne, Payload, Lösung, Outcome, Tipp — defensiv eingeengt
```

Dazu `'turn-pipes': TurnPipesGame` in `games/registry.ts` und `{ id: 'turn-pipes', title: 'Verrohrung' }`
in `labGameList`.

### Bilder

Acht PNGs, je 32 × 32 px, unter `games/turnpipes/tiles/`:

| Datei | Inhalt |
|---|---|
| `plate.png` | die Platte: grau, Nieten in den Ecken, Licht von oben links |
| `straight-dry.png`, `straight-wet.png` | gerades Rohr, leer / mit Wasser |
| `elbow-dry.png`, `elbow-wet.png` | Bogen, leer / mit Wasser |
| `inlet.png` | Zulauf mit rotem Handrad — **immer mit Wasser**, er ist die Quelle |
| `outlet-dry.png`, `outlet-wet.png` | Abfluss mit Abflussloch, leer / gefüllt |

Erzeugt **einmal** aus dem Zeichencode des Spikes (`spike/pipes/art.ts`), unverändert in Form und Farbe;
dieser Code wird nicht ausgeliefert. Eigene Pixelkunst — die Vorlage aus einem anderen Spiel war nur
Stilrichtung. Jedes Rohr ist in Stellung 0 gezeichnet (siehe *Die Regeln*) und quer zu seiner Achse
symmetrisch schattiert, damit es in jeder Drehung stimmt; die Platte dreht nie und darf Licht tragen.
Dargestellt mit `image-rendering: pixelated`.

### Brett

1. **Das Raster**, kartenbreit und randlos — ohne Innenabstand der Karte, die am Handy selbst schon von
   Kante zu Kante reicht. Bei 8×8 auf 375 px sind das 46,9 px je Kachel, auf 360 px 45 px; mit dem
   Innenabstand fiele 8×8 unter die 44-px-Grenze. Je Zelle zwei Ebenen: die Platte steht, das Rohr dreht.
   Zwischen den Kacheln nur der durchsichtige Rand der Platten, kein Raster.
2. **Darunter** der `HoldButton` „Abgeben“ und rechts daneben der **Stummschalter** (siehe *Ton*).

**Drehen:** Jede Zelle führt ihre Vierteldrehungen fortlaufend (`turns.ts`); angezeigt wird
`rotate(turns × 90°)`, die Stellung ist `turns mod 4`. So dreht jedes Tippen im Uhrzeigersinn weiter,
nie von 270° rückwärts auf 0°. Übergang 150 ms; bei reduzierter Bewegung ohne. Doppeltippen darf nicht
zoomen (`touch-action: manipulation`). Die Bilder nehmen keinen Zeiger an und lassen sich nicht ziehen
(`draggable="false"`, `pointer-events: none`, `-webkit-user-drag: none`); langes Drücken öffnet unter
iOS kein Menü (`-webkit-touch-callout: none`). Getippt wird immer die Zelle darunter.

**Phase zwei:** die `RevealCover` liegt über dem Raster; die Bühne gibt ihr das quadratische Maß. Das
Halten zählt ein, die Stoppuhr im Band läuft ab dem Aufdecken.

### Zwischenstand

Wie bei Blockierung, dieselben Bausteine aus `games/drafts.ts`:

- **Gesichert** werden die Stellungen (`turns mod 4`) nach jedem Tippen auf dem Gerät, unter
  `turn-pipes:draft:<userId>:<1|2>:<Fingerabdruck von size, kinds, start>` — im Labor ebenso über die
  Labor-Runde.
- **Wiederhergestellt**, sobald das Brett erscheint, ohne Drehanimation.
- **Gelöscht**, wenn der Tipp angenommen ist; eigene Einträge anderer Runden, älter als zwei Tage, räumt
  das Öffnen einer Runde weg.
- Was nicht lesbar ist (falsche Länge, Wert außerhalb 0..3), wird verworfen, nicht repariert.

### Auflösung

Das Raster bleibt stehen, wie abgegeben. Im Takt von `revealChoreography.ts`:

1. **Wechsel** — nichts bewegt sich.
2. **`SOLUTION_DELAY_MS` (900 ms)** — das Wasser läuft: die Zellen aus `wet` werden der Reihe nach nass,
   so schnell, dass ein voller Lauf durch alle Rohre **2 s** dauert, gleich welche Größe (8×8 ≈ 31 ms je
   Kachel, 6×6 ≈ 56 ms). So endet er gut vor der Mitgliederleiste über der Karte, die 3,8 s nach der
   Abgabe Punkt oder Totenkopf zeigt (`SPOILER_HOLD_MS`); 110 ms je Kachel waren am Handy zu langsam
   (2026-11-18). Danach, falls es ein Leck gibt, ein roter
   Ring: um `leak.at`, oder um `leak.from`, wenn das Wasser über den Rand lief. Ist der Abfluss erreicht,
   aber nicht jedes Rohr nass, braucht es keine Markierung — die trockenen Rohre sind zu sehen.
3. **`RESULTS_DELAY_MS` (ab 1900 ms)** — die Rangliste baut sich auf.

**Der eigene Tipp ist vorausgewählt.** Ein anderer Name in der Rangliste ist ein Knopf (wie bei
Blockierung): das Raster dreht sich auf dessen Stellungen, und dessen Wasser läuft (`wet`, `leak` aus
dessen Outcome). Derselbe Name nochmal — auch der eigene — hebt die Auswahl auf: dann dreht sich das
Raster auf die **Lösung**, und das Wasser läuft entlang `path` durch alle Kacheln. Ohne eigenen Tipp
(Historie, Zuschauer) steht die Lösung, niemand ist gewählt. Gedreht wird jeweils auf kürzestem Weg im
Uhrzeigersinn; ein gerades Rohr nimmt von seinen zwei gleichwertigen Stellungen die nähere.

### Ton

Fünf Klänge, gewählt per Gehör im Spike (Stand `bd13ed45`, `webapp-vue/src/spike/pipes/sounds/`), alle von
Freesound, **CC0 1.0** — auf der Seite jedes Klangs geprüft (2026-11-18). Übernommen werden die
HQ-Vorschauen (MP3, 128 kbps), unverändert, als `games/turnpipes/sounds/<name>.mp3`:

| Ereignis | Datei | Aufnahme | Quelle |
|---|---|---|---|
| Drehen — jedes Tippen | `turn.mp3` | Metal Flick 4 (WasabiWielder) | freesound.org/s/323374 |
| Wasser fließt — solange es läuft | `flow.mp3` | water flowing from a pipe into the sewer (FartMuffin) | freesound.org/s/571551 |
| Leck — das Wasser stoppt am Bruch oder läuft über den Rand | `leak.mp3` | Splash-eau-goudron1 (rombart) | freesound.org/s/186748 |
| Erfolg — angekommen, alle Rohre nass | `success.mp3` | Water gush; full (HonorHunter) | freesound.org/s/271668 |
| Rohre trocken — angekommen, aber nicht alle nass | `dry.mp3` | ANI Big Pipe Hit (ani_music) | freesound.org/s/244983 |

- **Abspielen** über den einen `AudioContext` aus `ui/audio.ts`, vorab dekodiert, wenn das Spiel erscheint;
  unter iOS mit `navigator.audioSession.type = 'playback'`, wie Peilung, sonst schweigt der Stummmodus des
  Telefons Web Audio.
- **Drehen:** Tonhöhe ±5 % gestreut, Lautstärke 0,6. **Fließen:** in Schleife, Lautstärke 0,5, beim
  letzten nassen Feld in 0,3 s ausgeblendet; danach genau einer der drei Abschlüsse. **Erfolg** blendet
  nach 2,5 s in 0,6 s aus. Die Werte aus dem Spike sind Startwerte, gestimmt wird im Labor.
- **Jedes Mal, wenn Wasser läuft**, klingt es: bei der eigenen Auflösung, beim Antippen eines Namens, bei
  der Lösung.
- **Stummschalter:** Blockierung hat einen (`copy-blocks:sound`, Knopf mit Lautsprecher-Symbol auf dem
  Brett). Er wird zu **einem** gemeinsamen Schalter für alle Spiele mit Ton — eine Komponente in `ui/`, eine
  Einstellung pro Gerät, Vorgabe an —, Blockierung stellt um. Wer Ton aus will, will ihn überall aus. Der
  alte Schlüssel entfällt; ohne Nutzer trifft das niemanden.
- **Quellenangabe:** `sounds/CREDITS.md` neben den Dateien (Aufnahme, Autor, Quelle, Lizenz, „HQ-Vorschau
  von freesound.org“). CC0 verlangt keine Nennung, deshalb kein Abschnitt auf der Rechtliches-Seite.

### Rangliste

Echte Tabelle im Stil von Blockierung, Spalten **Name** (Knopf) **· [mm:ss] · Pkt** — [mm:ss] nur in
Phase zwei; ob richtig, sagen die Punkte und das Raster. Sortierung wie dort: Punkte absteigend (`null`
zuletzt), richtig vor falsch, Dauer aufsteigend, `userId` als Tiebreak. Als pure `scoreboard.ts`.

### Erklärung

`InfoBox` mit Storage-Key `turn-pipes`. Kurztext: „Dreh die Rohre, bis das Wasser vom Handrad zum Abfluss
durch jedes Rohr läuft.“ Darunter die Regeln: Tippen dreht eine Kachel; auch Zulauf und Abfluss drehen
sich; es zählt nur eine Leitung durch alle Rohre. Den Ecken-Trick verrät sie nicht. Was die Runde zahlt
und dass in Phase zwei die Zeit zählt, sagt die `AwardBox`.

## Labor

`turn-pipes` / „Verrohrung“ in `labGameList` und `registry`. Der Phasenschalter zeigt beide Gesichter.
Die Schwierigkeit folgt im Labor aus dem Seed (0,0 bis 1,0 in Zehnteln), also kommen über neue Seeds
alle drei Größen dran; der Seed macht Brett und Start reproduzierbar. Hier werden gestimmt: Dreh-Dauer,
Fließtempo, Takte, Lautstärken.

## Tests

**Kotlin**

- **Zug:** `kinds`, `start`, `solution`, `path` variieren nur mit dem Presentation-Seed (Bauform von
  `GuessHueDrawTest`); `size` ist 6 / 7 / 8 an den Schwellen der Schwierigkeit (0,0 · 0,33 · 0,34 · 0,66 ·
  0,67 · 1,0); `timed` aus der Phase.
- **Generator** (über viele Seeds und alle Größen): `path` besucht jede Zelle genau einmal, Nachbarn
  folgen aufeinander; genau ein `INLET` am Anfang und ein `OUTLET` am Ende, beide Randfelder, Abstand ≥ 3;
  `kinds` passen zum Weg; mit `solution` gelegt ist das Brett gelöst; mit `start` nicht.
- **Öffnungen:** jede Art in jeder Stellung gegen die Tabelle unter *Die Regeln*.
- **Wasserlauf:** gelöstes Brett → angekommen, alle nass; Lauf über den Rand → Leck mit `at = null`; in
  eine Kachel ohne Öffnung zurück → Leck mit `at`; angekommen, aber Zellen trocken →
  nicht `correct`; eine andere gültige Stellung als `solution` (gerades Rohr um 180° gedreht) → `correct`.
- **Validierung:** falsche Länge, Wert −1 und 4, Bruch, fehlendes Feld, kein Array →
  `InvalidGuessException`.
- **Ausgänge:** Feldmengen-Tests für Bühne, Payload, Lösung und Outcome.
- `LabPointsParityTest` bleibt grün.

**Vitest**

- `turns.ts`: Tippen zählt weiter; Stellung `mod 4`; Drehen auf eine Zielstellung im Uhrzeigersinn,
  gerades Rohr auf die nähere der zwei.
- `tiles.ts`: jede Art × nass/trocken hat ein Bild; der Zulauf ist immer nass.
- `scoreboard.ts`: Sortierung in beiden Phasen, mm:ss, fehlende Werte.
- `types.ts`: Einengen von Bühne, Payload, Lösung, Outcome (unbekannter Code, falsche Länge, `NaN` fallen
  raus).
- Brett: Tippen dreht genau diese Kachel; Halten → ein `guess` mit `size²` Stellungen.
- Zwischenstand: gesichert nach Tippen, wiederhergestellt beim Öffnen, gelöscht nach angenommenem Tipp,
  fremde Runden weggeräumt, Unlesbares verworfen.
- Auflösung: das Wasser folgt `wet`, der Ring sitzt am Leck; ein anderer Name dreht auf dessen Stellungen;
  abgewählt dreht es auf die Lösung.
- Ton: Tippen spielt Drehen; ein Lauf spielt Fließen und danach Leck, Erfolg oder Trocken passend zum
  Outcome; der Stummschalter wirkt, wird gemerkt und gilt auch für Blockierung; ohne `AudioContext` still
  statt Fehler.
- Kacheln: die Bilder sind nicht ziehbar.

## Bewusst nicht

- **Live-Feedback** (die grüne Strecke) — dann kann niemand danebenliegen.
- **Füllkacheln** — der Spike-Modus, in dem der Weg nur einen Teil des Bretts deckt: trivial.
- **Feste Enden** — zwei Anker, von denen man vorwärts und rückwärts hangelt.
- **Ein Brett ohne Rand** — über das Ziel hinaus.
- **T-Stücke und Kreuzungen** — die Spielidee kennt nur gerade Rohre und Bögen.
- **Zähler** für Tipps, **Rückgängig**.
- **Den Ecken-Trick in der Erklärung** — ihn zu finden gehört zum Spiel.
- **Teilpunkte** — ganz oder gar nicht.
- **Anomalie-Erkennung** unrealistisch schneller Treffer — dieselbe Begründung wie bei Musterung.
- **Ein Gurgeln als Erfolg** — das Wasser fließt nicht ab, es bleibt in den Rohren.

## Dem Bauenden überlassen

- Die Obergrenze für Schritt 2 des Generators.
- Wo der Stummschalter in der Auflösung sitzt, solange er da ist.
- Wie die PNGs aus dem Zeichencode des Spikes entstehen (etwa eine Wegwerf-Seite mit `canvas.toBlob`).
- Ob das Raster den Wechsel vom Brett zur Auflösung überlebt oder neu entsteht — solange es nicht springt.
- Ob `PipeGrid` die Wasser-Animation selbst führt oder sie als Prop bekommt.

## Folgen für andere Dokumente

- **Blockierung-Spec:** Der Stummschalter ist ab jetzt der gemeinsame (*Ton* hier); „Ton an/aus merkt sich
  das Gerät“ gilt weiter, nur nicht mehr pro Spiel.
