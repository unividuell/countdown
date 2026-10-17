# Blockierung („Copy Blocks“) — ein Blockgebilde exakt nachbauen

**Status:** beschlossenes Design (2026-10-16).

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), der
[Hülle](2026-09-25-reveal-cover-design.md), der [Spieluhr](2026-09-11-game-stopwatch-design.md) und dem
[Spiel-Labor](2026-08-08-game-lab-design.md). Phasen, Punkte, Zeit und Auflösungs-Takt übernimmt es
wörtlich von [Musterung](2026-08-24-musterung-design.md) und
[Platzierung](2026-10-15-platzierung-design.md); die antippbaren Namen in der Rangliste von
[Entstauber](2026-09-14-entstauber-design.md).

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — mit einer niedrigeren Decke als
Musterung, benannt unter *Integrität*.

**Berührt:** ein neues Modulith-Modul `copyblocks` (reine Logik, **kein Schema, keine Tabelle**), den
Adapter `CopyBlocksGameType` in `game.internal`, Golden-Vektoren unter `shared/copy-blocks/`, im Frontend
ein neues Spielverzeichnis `games/copyblocks/` plus die Einträge in `games/registry.ts` und
`gamelab/games.ts`, eine neue Abhängigkeit `three`, den hochgezogenen `AudioContext` (`ui/audio.ts`,
Anspielung stellt um) und einen Abschnitt auf der Rechtliches-Seite.

## Zweck & Spielidee

Ein Gebilde aus Blöcken steht als Vorlage im Bild, frei umkreisbar. Darüber liegt ein leeres Baufeld mit
Raster. Der Spieler setzt Blöcke aus einer Hotbar, bis sein Nachbau der Vorlage gleicht. Minecraft ist
das Vorbild für Blöcke, Klänge und Bedienung — reduziert aufs Setzen und Abbauen. **Nur der exakte
Nachbau zählt.**

Entstanden aus einem Spike (2026-10-16). Was er gezeigt hat und was daraus folgt:

- **Machbar, und es macht Spaß — anstrengend.** 27 Blöcke sind mittel bis schwer; die Blockzahl ist der
  Schwierigkeitshebel, die Zahl der Typen wirkt schwächer. „Das anstrengendste Spiel der Plattform“ ist
  kein Makel.
- **Ein Bedienmodus für alle Geräte (Fairness).** Tippen setzt dorthin, wo der Finger trifft. Ein
  Fadenkreuz-Modus ging am PC gut, am Handy schlechter — er fällt weg.
- **Keine Vorschau unter dem Finger.** Mit der Maus war sie sehr gut, auf Touch verdeckt sie der Finger;
  eine Lupe darüber war verwirrend (zwei 3D-Modelle ineinander). Was nur ein Gerät nutzen kann, bekommt
  keins. Das Sicherheitsnetz ist Rückgängig.
- **Langdruck baut nicht ab** — er ist am PC unbewusst passiert. Abbauen geht nur mit der Spitzhacke.
- **Keine Zähler.** Ohne sie vergisst man gern ein, zwei Blöcke; das gehört zur Schwierigkeit.
- **Echte Minecraft-Klänge statt Synthese.** Die Blocktypen sind nach der Lizenz ihrer Klänge gewählt.
- **Acht Hotbar-Plätze passen aufs Handy, ohne zu scrollen** — höchstens sieben Typen plus Spitzhacke.
- **Seitenscrollen über zwei 3D-Ansichten ist mühsam** — beide fangen die Geste. Die Vorlage wird
  schmaler, daneben bleibt ein Streifen zum Scrollen.

Referenz zum Anfassen: Branch `feature/3d-blocks-game-spike-f3ad04` (Stand `51db7082`), Seite
`/c/[slug]/spike/bloecke`, Code unter `webapp-vue/src/spike/blocks/`. Der Spike rechnet alles im
Browser; hier ziehen und werten der Server.

- **Codename:** `copy-blocks` (Game-ID), `copyblocks` (Modul), `CopyBlocks*` (Klassen).
- **Anzeigename:** „Blockierung“.

## Die Regeln

**Die Vorlage:** pro Runde zufällig **8 bis 58 Blöcke** aus **3 bis 7 Blocktypen** — den ersten N der
festen Reihenfolge unter *Blocktypen*. Alle Blöcke hängen über Flächen zusammen, und **jede Zelle
innerhalb ihrer Außenmaße ist von außen einsehbar** (siehe *Der Generator*): nur so lässt sie sich
exakt nachbauen.

**Das Baufeld** beginnt als Würfel von 6³ Zellen und reicht immer **einen Block über den Nachbau
hinaus** — seitlich und nach oben. Unten liegt der Boden auf Höhe des tiefsten Blocks; wer von unten an
die Unterseite eines Blocks tippt, setzt darunter, und der Boden sinkt mit. Werden Blöcke entfernt,
schrumpft das Feld wieder, nie unter 6³. So läuft ein Nachbau, der nah am Rand begonnen wurde, nie in
eine Wand.

**Bedienen** — beide Ansichten gleich:

| Geste | Wirkung |
|---|---|
| ein Finger ziehen | umkreisen; oben bleibt oben, auch von unten ansehbar |
| zwei Finger / Mausrad | zoomen — auf den Punkt zwischen den Fingern bzw. unter dem Zeiger, der dabei stehen bleibt; die Ansicht dreht sich danach um ihn |
| tippen (Baufeld) | einen Block des gewählten Typs auf die getroffene Fläche setzen, oder auf den Boden |
| tippen mit Spitzhacke (Baufeld) | den getroffenen Block abbauen |

Tippen und Ziehen trennt eine Schwelle von ~8 CSS-px; Langdruck und Rechtsklick haben keine
Bedeutung. Dazu: **Hotbar** mit den N Typen der Runde und der Spitzhacke, **Rückgängig**,
**Ton an/aus** und **Zentrieren** — zurück zur Feldmitte, ohne die Drehung zu ändern, und so
weit heraus, dass wieder alles zu sehen ist (der Zoom auf den Zeiger kann den Bau aus dem Bild schieben).

**Zwischenstand:** Der angefangene Nachbau überlebt ein Neuladen und einen vom Handy verworfenen Tab —
siehe *Zwischenstand* unter *Frontend*.

**Abgabe:** Halten des `HoldButton`, aktiv ab einem Block. Genau ein Tipp pro Spieler und Runde — die
Regel des Frameworks.

**Treffer heißt:** der Nachbau gleicht der Vorlage Zelle für Zelle und Typ für Typ — bis auf eine
**Verschiebung** und eine der **vier Drehungen um die Hochachse**. Gekippt, auf dem Kopf oder gespiegelt
ist kein Treffer — so falsch wie jeder andere Fehler, ohne eigenen Hinweis.

**Die Phasen — wörtlich die von Musterung und Platzierung:**

| | Phase eins | Phase zwei |
|---|---|---|
| Aufdecken | nein, das Brett ist sofort da | **ja, genau einmal** |
| Zeit | läuft nicht ins Ergebnis ein, wird nicht gezeigt | entscheidet; Stoppuhr im Band |
| Award | `ALL_QUALIFYING` — jeder Treffer 1 Punkt | `CLOSEST_ONLY` — **der schnellste** Treffer nimmt alles |

Im Vertrag: `requiresReveal(params) = scoresOnDuration(params) = params.timed`, `timed` setzt der Zug
aus der Phase — dieselbe Bauform wie `PlacePatchParams.timed`.

## Blocktypen

Die Reihenfolge legt fest, welche N Typen eine Runde spielt: **die ersten N**. Gewählt wurden nur Typen,
deren Minecraft-Klang aus einer offen lizenzierten Freesound-Aufnahme stammt; alle anderen Blockklänge
im Minecraft-Wiki gehören Mojang (Recherche vom 2026-10-16, Datei für Datei, Lizenzen auf Freesound
selbst geprüft — die Wiki-Angabe ist nicht verlässlich).

| # | Code (Leitung) | Anzeigename | Aussehen | Klang Setzen | Klang Abbauen |
|---|---|---|---|---|---|
| 1 | `DIRT` | Erde | braun, dunkel gesprenkelt | Kies | Kies |
| 2 | `BRICKS` | Ziegel | rot mit hellen Fugen | Stein | Stein |
| 3 | `LEAVES` | Laub | grün, dunkel gesprenkelt | Gras | Gras |
| 4 | `PACKED_ICE` | Packeis | hellblau, deckend | Stein | Glas |
| 5 | `STONE` | Stein | grau | Stein | Stein |
| 6 | `HAY_BALE` | Heuballen | gelbe Halme, zwei dunkle Bänder | Gras | Gras |
| 7 | `LAPIS` | Lapis | dunkelblau mit Goldsprenkeln | Stein | Stein |

Die Zuordnung der Klänge folgt Minecraft (Erde klingt dort wie Kies, Glasblöcke setzen mit Stein).
Setzen spielt den Setz-Klang, Tonhöhe 0,8. **Abbauen** spielt erst einen dumpfen **Klopfer** und dann
den Abbau-Klang — so hört man, ob ein Block kam oder ging (siehe *Ton*).

Die Reihenfolge lebt **einmal** im Backend (`BlockType`-Enum in `copyblocks`); die Leitung trägt die
Codes, das Frontend bildet Code → Anzeigename, Textur, Klänge ab. Ein unbekannter Code fällt bei der
Einengung (`types.ts`) heraus, statt still als weißer Block zu erscheinen.

## Modulschnitt

```
game ──▶ copyblocks
```

`copyblocks` trägt: `BlockType`, `Block(x, y, z, type)`, den **Generator** (Ziehung mit
Sichtbarkeitsregel) und die **Wertung** (Passung und Abweichungen) — reine Funktionen, keine Datenbank.
Der Adapter `CopyBlocksGameType` trägt Params, Payload, Outcome, Leitungsformat und Validierung — nichts
davon kennt `copyblocks`.

## Der Zug

```kotlin
data class CopyBlocksParams(
    /** Kantenlänge des Startwürfels — der Ziehung und des Baufelds. */
    val grid: Int,
    /**
     * Die Typen der Runde — die ersten N der Reihenfolge, als Liste eingefroren: eine spätere
     * Änderung der Reihenfolge verändert keine alte Runde.
     */
    val types: List<BlockType>,
    /** Die Vorlage, normalisiert: kleinste Koordinate je Achse ist 0. */
    val blocks: List<Block>,
    val timed: Boolean,
)
```

Gezogen wird nach Veröffentlichung (siehe [game-rounds.md](../../../.claude/guidelines/game-rounds.md)).
**Alles aus `presentation`:** die Vorlage *ist* das, was ab dem Aufdecken zu sehen ist, und nichts an
ihr bleibt danach geschützt — es gibt kein Geheimnis, das ein anderer Strom hüten müsste. `scene` und
`solution` bleiben unberührt.

| Wert | Ziehung |
|---|---|
| Blockzahl | `presentation.nextIntBetween(8, 58)` |
| `types` | die ersten `presentation.nextIntBetween(3, 7)` der Reihenfolge |
| Vorlage | Generator mit `presentation` |
| `grid` | Konstante `GRID = 6` |
| `timed` | `context.phase == Phase.TWO` |

`grid` und die Grenzen sind Konstanten im Code, eingefroren in den Params — alles danach liest nur
dort. Andere Werte sind später eine Änderung an der Ziehung, alte Runden behalten ihre. Kein
Admin-Regler. **Verfügbar** ist das Spiel immer (`isAvailable` bleibt `true`).

### Der Generator

Übertragung von `generate` aus dem Spike (`spike/blocks/voxels.ts`) nach Kotlin:

1. Ein Block in der Mitte des `grid³`-Würfels, Typ zufällig aus `types`.
2. Wiederholt: einen vorhandenen Block zufällig wählen, eine der sechs Richtungen zufällig, die
   Nachbarzelle prüfen — im Würfel, frei, und **die Sichtbarkeitsregel hält danach noch**. Dann bleibt
   der Block, Typ zufällig; sonst wird verworfen.
3. Bis zur Blockzahl oder `Blockzahl × 300` Versuchen; danach normalisieren.

**Die Sichtbarkeitsregel:** Jede Zelle innerhalb der Außenmaße der Vorlage — **Block und Luft** — muss
entlang einer der sechs Achsrichtungen freie Sicht nach außen haben: zwischen ihr und der Außenfläche
liegt kein Block. Nur „Luft ist mit außen verbunden“ reicht nicht (ein geknickter Tunnel ist verbunden,
aber nicht einsehbar), und Luft zählt mit, weil ein verborgener Hohlraum genauso unlösbar ist wie ein
verdeckter Block. Geprüft wird je Achse mit zwei Durchläufen von den Außenflächen nach innen, bis zum
ersten Block (`allVisible` im Spike).

Gemessen im Spike über je 300 Ziehungen: in 6³ erreichen 8, 30, 45 und 58 Blöcke **immer** ihr Ziel, in
unter 1 ms. Erreicht eine Ziehung die Zahl doch einmal nicht, gilt die erreichte — bewusst ohne
erneuten Versuch, weil eine Runde mit 57 statt 58 Blöcken nichts verliert.

## Rundengeheimnis: die Ausgänge

Jeder Ausgang ist durch einen Feldmengen-Test gepinnt (Jackson 3, `propertyNames()`):

| Ausgang | wann | Felder |
|---|---|---|
| Bühne | — | `null`: Das Brett hat feste Höhen, die Hülle braucht nichts. |
| Payload `CopyBlocksPayload` | ab Aufdecken (Phase eins: sofort) | `grid`, `types` (Liste der Codes), `blocks` |
| Lösung | — | `null`: Die Vorlage steht bereits im Payload. |
| Outcome `CopyBlocksOutcome` | nach dem eigenen Tipp, für alle | `correct`, `fit`, `missing`, `extra`, `wrongType` |

`types` ist die Liste der N Codes aus den Params: die Hotbar zeigt genau diese — auch einen Typ, den die
Vorlage zufällig gar nicht benutzt. Die Regel „die ersten N“ kennt nur der Zug.

**Tipp auf der Leitung:** `{ "blocks": [ { "x": 0, "y": 0, "z": 1, "type": "DIRT" }, … ] }`.
Gültig: 1 bis 200 Blöcke, ganzzahlige Koordinaten mit Betrag ≤ 64, jeder Typ einer der N Codes der
Runde, keine Zelle doppelt. Alles andere — auch fehlende Felder, Brüche, unbekannte Codes — ist
`InvalidGuessException` → 400, **vor** jedem Schreibvorgang. `judge` gibt als `Judgement.guess` die
validierte Blockliste zurück (nichts anderes landet in der Spalte).

### Die Wertung

`judge` sucht die **Passung**: unter den vier Drehungen um die Hochachse und allen Verschiebungen, die
einen Block des Tipps auf einen der Vorlage legen, die mit den meisten Positionstreffern, danach den
meisten Typtreffern. Exakt heißt: gleiche Blockzahl und jeder Block deckt einen gleichen Typs.

`qualifies = correct`, `deviation = 0.0` — in Phase zwei ersetzt der Rahmen sie durch die Dauer.

**Die Passung auf der Leitung:**

```json
"fit": { "turns": 1, "dx": 3, "dy": 0, "dz": -2 }
```

Sie bildet eine Zelle des Tipps auf die Vorlage ab: `vorlage = drehe(tipp, turns) + (dx, dy, dz)`, mit
einer Vierteldrehung `drehe((x, y, z), 1) = (z, y, −x)`. Ohne einen einzigen Positionstreffer ist `fit`
die Identität.

**Die Abweichungen — in Vorlagen-Koordinaten:**

- `missing`: Blöcke der Vorlage, die der Tipp nicht deckt (`x, y, z, type` der Vorlage).
- `extra`: Blöcke des Tipps ohne Gegenstück, abgebildet in die Vorlage (`x, y, z, type` des Tipps).
- `wrongType`: gedeckte Zellen mit anderem Typ (`x, y, z, type` des Tipps).

Das Outcome geht nach dem eigenen Tipp an alle: harmlos, die Vorlage ist dann ohnehin öffentlich.

**Golden-Vektoren** (siehe [cross-runtime-parity](../../../.claude/guidelines/cross-runtime-parity.md)):
Die Wertung rechnet nur der Server — aber die Konvention von `fit` muss in beiden Laufzeiten gleich
gelesen werden, sonst sitzen die Markierungen daneben. `shared/copy-blocks/fit.json` hält Fälle
(Tipp-Zelle, `fit` → Vorlagen-Zelle und zurück), die ein Kotlin- und ein Vitest-Test beide lesen.

## Integrität — die Decke, benannt

**Die Lösung steht im Payload.** Das muss sie: der Client zeichnet die Vorlage. Ein Skript kann sie
deshalb unverändert als Tipp abschicken — in Phase eins ein sicherer Punkt, in Phase zwei der
schnellste Treffer, jedes Mal. Das ist die Kategorie „Lösung liegt im Sichtbaren“ wie bei Musterung,
aber ohne deren Rest-Aufwand: kein Bildvergleich, nur Kopieren. Nicht abwendbar, ohne das Spiel zu
ändern (Drehen oder Verschieben im Payload hilft nicht, beides ist erlaubt). Hingenommen, wie die
Anti-Cheat-Spec es für eine Gemeinschaft unter Freunden tut.

## Frontend

```
games/copyblocks/
  CopyBlocksGame.vue        Ablauf: (Hülle) → Brett → Auflösung
  CopyBlocksBriefing.vue    InfoBox („copy-blocks“) + AwardBox, mit CopyBlocksRules.vue
  CopyBlocksBoard.vue       Baufeld oben, Vorlage darunter, Hotbar, Knöpfe, HoldButton
  BlockScene.vue            eine Three.js-Ansicht (aus dem Spike, ohne Fadenkreuz, Vorschau, Langdruck)
  field.ts                  das wachsende Baufeld — rein
  fit.ts                    Passung anwenden und umkehren — rein, gegen die Golden-Vektoren
  blockTypes.ts             Code → Anzeigename, Textur, Klänge
  textures.ts               eigene 16×16-Pixeltexturen, Flächenschattierung wie Minecraft
  sounds.ts                 Klänge spielen; sounds/*.m4a + sounds/CREDITS.md
  CopyBlocksReveal.vue      die Auflösung
  CopyBlocksScoreboard.vue  + scoreboard.ts
  types.ts                  Payload, Outcome, Tipp — defensiv eingeengt
```

Dazu `'copy-blocks': CopyBlocksGame` in `games/registry.ts` und `{ id: 'copy-blocks', title:
'Blockierung' }` in `labGameList`.

**Three.js** (`three`, `@types/three`) kommt als Abhängigkeit dazu — im Spike 0.186. Gerendert wird nur
bei Eingaben, ohne Animationsschleife; Blöcke als Meshes mit `MeshBasicMaterial`, Helligkeit pro Fläche
eingebacken (oben 1,0 · Seiten 0,62/0,82 · unten 0,5), keine Lichter.

### Brett

Von oben nach unten:

1. **Das Baufeld**, kartenbreit. Raster auf dem durchscheinenden Boden, ein dünner Käfig um das Feld.
   Oben links **Zentrieren**, oben rechts **Rückgängig** und **Ton**; am unteren Rand die **Hotbar** im
   Minecraft-Stil. Kein Zähler, keine Beschriftung mit Blockzahlen.
2. **Die Vorlage**, schmaler — etwa drei Viertel der Breite, mittig. Die Streifen links und rechts
   gehören dem Seitenscrollen, mit beiden Händen erreichbar; mittig steht sie zudem unter dem Nachbau,
   der oben meist mittig entsteht. Rasterboden einen Block breiter als ihr Grundriss, Kamera auf ihr
   Maß eingerahmt. Oben links auch hier **Zentrieren**, für ihre eigene Kamera.
3. **Der `HoldButton`** „Abgeben“.

Startwinkel beider Ansichten gleich, Gieren 0,6 und Neigen 0,45 wie im Spike.

**Die Hotbar scrollt nie:** N + 1 Plätze, höchstens acht; auf einem schmalen Handy schrumpfen die Plätze
unter 44 px (bei 375 px Breite 38,6 px), statt dass die Leiste scrollt — die eine bewusste Ausnahme von
der 44-px-Regel.

**Phase zwei:** die `RevealCover` liegt über Baufeld und Vorlage; das Halten zählt ein, die Stoppuhr im
Band läuft ab dem Aufdecken.

### Zwischenstand

Ein Nachbau mit 30 bis 58 Blöcken dauert am Handy Minuten, und zwei 3D-Ansichten machen es
wahrscheinlicher, dass das Handy den Tab im Hintergrund verwirft. In Phase zwei läuft die Uhr des
Servers dabei weiter — ein verlorener Nachbau wäre eine verlorene Runde.

- **Gesichert** wird die Blockliste nach jeder Änderung auf dem Gerät (`localStorage`), unter einem
  Schlüssel aus Spieler und Runde — im Labor aus Spieler und Labor-Runde (Spiel, Seed, Phase): das Labor
  spiegelt das Produkt.
- **Wiederhergestellt** wird sie, sobald das Brett erscheint — in Phase zwei also nach dem Aufdecken,
  das der Server ohnehin kennt.
- **Gelöscht** wird sie, wenn der Tipp angenommen ist; eigene Einträge anderer Runden, die älter als
  zwei Tage sind, räumt das Öffnen einer Runde weg — ein jüngerer kann der laufende Nachbau einer
  anderen Community sein.
- **Nicht gesichert:** der Verlauf für Rückgängig, die gewählte Hotbar, die Kamera. Nach dem Neuladen
  steht der Nachbau, Rückgängig beginnt leer.
- Was nicht lesbar ist (alt, verstümmelt, Typ außerhalb der Runde), wird verworfen, nicht repariert.
- Geht dem Browser die 3D-Grafik verloren (`webglcontextlost`), wird aus dem Zustand im Speicher neu
  gezeichnet.

### Auflösung

Das Baufeld **wird** zur Lösung — ohne Kamerasprung. Der Client zeichnet die Vorlage in den
Koordinaten des eigenen Nachbaus (Umkehrung der eigenen `fit`), also exakt im Blickwinkel der Abgabe.
Darauf die Markierungen aus dem Spike: fehlend als Geist (gelb), überzählig rot, falscher Typ orange.
Oben links steht wie auf dem Brett **Zentrieren**. Darunter rechts das Kästchen **Fehler markieren**,
vorgegeben an; abgewählt steht der gewählte Tipp ohne Markierungen. Die Kamera rahmt dabei weiter das Feld der Abgabe. Der Boden aber rückt mit der Lösung unter sie: Wer
nur den oberen Teil der Vorlage getroffen hat, steht höher als die Lösung, und sein eigener Boden
schnitte sie mittendurch.

Im Takt von `revealChoreography.ts`, die Stufen von Musterung und Platzierung:

1. **Wechsel** — nichts bewegt sich; der eigene Nachbau steht, wo er stand.
2. **`SOLUTION_DELAY_MS` (900 ms)** — die Lösung: fehlende Blöcke erscheinen, Fehler werden markiert,
   und das Feld dreht sich einmal ganz um die Hochachse (Startwert 3 s) — so kommt jeder Fehler
   einmal nach vorn. Ein Finger oder das Mausrad auf dem Feld hält die Drehung an; beim Neuladen, bei
   reduzierter Bewegung und im Hintergrund dreht nichts.
3. **`RESULTS_DELAY_MS` (ab 1900 ms)** — die Rangliste baut sich auf, an der Stelle der unteren Vorlage.

**Der eigene Tipp ist vorausgewählt.** Ein anderer Name in der Rangliste ist ein Knopf (wie bei
Entstauber): er zeigt dessen Tipp in derselben Ansicht — Vorlage plus dessen Abweichungen, über
`missing`/`extra`/`wrongType` in Vorlagen-Koordinaten und damit mit derselben eigenen Umkehrung
gezeichnet. Derselbe Name nochmal — auch der eigene — hebt die Auswahl auf: dann steht nur die Lösung
im Bild, ohne Markierungen, im eigenen Blickwinkel. Ohne eigenen Tipp (Historie, Zuschauer) steht die
Vorlage in ihren eigenen Koordinaten, niemand ist gewählt.

**Zu stimmen im Labor:** ob statt „gleicher Blickwinkel“ eine Drehbewegung den Nachbau in die Lage der
Vorlage führt; die Takte; die Dauer der Drehung.

### Rangliste

Echte Tabelle im Stil von Musterung und Platzierung. Spalten: **Name** (Knopf) **· K/D\* · [mm:ss] ·
Pkt** — [mm:ss] nur in Phase zwei. **K/D** zählt wie die K/D der Shooter: korrekt gesetzte Blöcke /
alles Markierte (fehlend, zu viel, falscher Typ), etwa `24/3`; ein perfekter Nachbau steht als `27/0`.
Darunter rechts die Legende „* K korrekt · D daneben (fehlend, zu viel, falscher Typ)“. Sortierung wie dort: Punkte absteigend (`null` zuletzt), Treffer vor
Nicht-Treffern, Dauer aufsteigend, `userId` als Tiebreak. Als pure `scoreboard.ts`.

### Erklärung

`InfoBox` mit Storage-Key `copy-blocks`. Kurztext: „Baue die Vorlage nach — Block für Block, exakt.“
Darunter die Regeln: Tippen setzt auf die getroffene Fläche, mit der Spitzhacke abbauen, ein Finger
dreht, zwei zoomen; wie herum du baust, ist egal, nur oben bleibt oben; es zählt nur der exakte Nachbau.
Was die Runde zahlt und dass in Phase zwei die Zeit zählt, sagt die `AwardBox`.

### Ton

Die 15 Samples aus dem Spike (Stein 4, Gras 4, Kies 4, Glas 3), als AAC (`.m4a`, ~5–7 KB). Eine Variante
zufällig, Tonhöhe 0,8 · ±5 %, gleiche Lautstärke für Setzen und Abbauen. Vorab dekodiert, wenn das Spiel
erscheint.

**Der Klopfer beim Abbauen** bildet Minecrafts `hit`-Einstellung nach — mit dem freien Sample, weil
Minecrafts eigene Klopf-Dateien Mojang gehören: eine Variante des **Setz-Klangs** des Typs (Packeis
also Stein) mit **halber Tonhöhe** (0,5) und **Viertel-Lautstärke** (0,25), unmittelbar gefolgt vom
Abbau-Klang. Der Abstand zwischen beiden — Startwert 60 ms — wird im Labor nach Gehör gestimmt.

- **Der eine `AudioContext`** wandert aus `usePlayback` nach `ui/audio.ts` — die
  [Audio-Regel](../../../.claude/guidelines/frontend-state.md) verlangt einen für die ganze App, und
  Anspielung behält ihr Verhalten. Abspielen mit 50 ms Vorlauf.
- **Ton an/aus** merkt sich das Gerät (`localStorage`, `useStorage`), Vorgabe an.
- **Quellenangaben:** `sounds/CREDITS.md` neben den Dateien (Quelle, Autor, Lizenz, Umwandlung) und ein
  Abschnitt „Klänge in Blockierung“ auf der Rechtliches-Seite, neben Google Maps. Kies steht unter
  CC BY-NC 4.0 — countdown ist nicht-kommerziell; ändert sich das, müssen diese Dateien raus.

## Labor

`copy-blocks` / „Blockierung“ in `labGameList` und `registry`. Der Phasenschalter zeigt beide Gesichter.
Der Seed in der URL macht Blockzahl, Typen und Vorlage reproduzierbar. Hier werden gestimmt: der
Übergang zur Auflösung, die Breite der Vorlage, die Tippschwelle, die Takte, der Abstand zwischen
Klopfer und Abbau-Klang.

## Tests

**Kotlin**

- **Zug:** Blockzahl, `types` und Vorlage variieren nur mit dem Presentation-Seed (Bauform von
  `GuessHueDrawTest`); Blockzahl in 8..58; `types` sind die ersten 3..7 der Reihenfolge; jede Vorlage
  hält die Sichtbarkeitsregel, hängt über Flächen zusammen, ist normalisiert und nutzt nur Typen aus
  `types`; `timed` aus der Phase.
- **Sichtbarkeitsregel:** hohler 3³-Würfel abgelehnt; geknickter Tunnel abgelehnt; Rinne akzeptiert.
- **Wertung:** jede der vier Drehungen plus Verschiebung exakt; gekippt und gespiegelt falsch; ein
  fehlender, ein überzähliger, ein falscher Typ landen in der richtigen Liste mit Vorlagen-Koordinaten;
  `fit` bildet den Tipp auf die Vorlage ab.
- **Validierung:** leer, über 200, doppelte Zelle, Code außerhalb der N, unbekannter Code, Koordinate
  über 64, Bruch, fehlendes Feld → `InvalidGuessException`.
- **Ausgänge:** Feldmengen-Tests für Payload und Outcome; Bühne und Lösung sind `null`.
- **Golden-Vektoren:** `fit.json` in beide Richtungen.
- `LabPointsParityTest` bleibt grün.

**Vitest**

- `field.ts`: Start 6³, Wachstum seitlich und oben, Boden sinkt, Schrumpfen nie unter 6³.
- `fit.ts`: die Golden-Vektoren; Umkehrung.
- `scoreboard.ts`: Sortierung in beiden Phasen, mm:ss, fehlende Werte.
- `types.ts`: Einengen von Payload und Outcome (unbekannter Code, `NaN` fallen raus).
- Brett: Halten → ein `guess` mit der Blockliste; Hotbar zeigt N + 1 Plätze.
- Zwischenstand: gesichert nach Änderung, wiederhergestellt beim Öffnen, gelöscht nach angenommenem
  Tipp, fremde Runden weggeräumt, Unlesbares verworfen.
- Ton: Abbauen plant zwei Klänge (Klopfer mit 0,5 / 0,25, danach Abbau-Klang), Setzen einen;
  Stummschalter wirkt und wird gemerkt; ohne `AudioContext` still statt Fehler.

## Bewusst nicht

- **Fadenkreuz, Vorschau unter dem Finger, Lupe** — siehe *Zweck & Spielidee*: unfair oder verwirrend.
- **Zähler** für eigene oder geforderte Blöcke.
- **Alles abreißen** — im Labor gestrichen (2026-10-17); Rückgängig und die Spitzhacke bleiben.
- **Langdruck und Rechtsklick zum Abbauen** — Langdruck passierte unbewusst; der Rechtsklick wäre ein
  Tempovorteil nur für die Maus (ein Klick statt drei Tipps), in Phase zwei entscheidet aber das Tempo.
- **Ansichten koppeln** und alle übrigen Spike-Regler.
- **Teilpunkte** — ganz oder gar nicht.
- **Die Baureihenfolge im Tipp** — weder für eine Wiedergabe in der Auflösung noch gegen Betrug. Gegen
  Betrug hilft sie kaum: eine gültige Reihenfolge erzeugt ein Skript in wenigen Zeilen (vom Boden aus
  über Nachbarn), und eine Regel für den Endstand gibt es nicht — wer einen tragenden Block abbaut,
  lässt legitim einen schwebenden zurück. Eine ehrliche Wiedergabe bräuchte das ganze Protokoll samt
  Abbauen und Zeiten. Das öffentliche Geheimnis ist hingenommen, siehe *Integrität*.
- **Minecrafts eigene Klopf-Dateien** (`hit`) — sie gehören Mojang (geprüft: `Stone_hit1`,
  `Gravel_hit1`, keine Freesound-Quelle); der Klopfer wird aus dem freien Sample nachgebildet.
- **Weitere Blocktypen** — nur mit offen lizenziertem Klang; heute gibt es keinen weiteren.
- **Schwierigkeit nach Phase oder Runde** — gezogen wird gleichverteilt, Regler gibt es keinen.
- **Anomalie-Erkennung** unrealistisch schneller Treffer — dieselbe Begründung wie bei Musterung.

## Dem Bauenden überlassen

- Welche Passung gilt, wenn mehrere gleich gut sind — Hauptsache deterministisch.
- Wie die Wertung bei 200 Blöcken schnell bleibt.
- Ob `three` erst mit dem Spiel geladen wird.
- Was erscheint, wenn das Gerät kein WebGL kann.
- Ob dieselbe 3D-Ansicht den Wechsel vom Brett zur Auflösung überlebt oder neu entsteht — solange der
  Blickwinkel gleich bleibt.

## Folgen für andere Dokumente

- **`frontend-state.md`:** Der gemeinsame `AudioContext` lebt in `ui/audio.ts`, nicht mehr in
  `usePlayback`.
- **`frontend-ui.md`:** Die Hotbar ist die benannte Ausnahme von der 44-px-Regel (schrumpfen statt
  scrollen) — bei der Umsetzung als Regel nachtragen, falls sie über dieses Spiel hinaus trägt.
